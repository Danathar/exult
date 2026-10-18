#!/usr/bin/env node
// PreToolUse hook for Claude Code's Bash tool (wired up in .claude/settings.json).
//
// Threat model: this hook stops an agent that is following instructions from
// carelessly or accidentally (a) writing to the wrong GitHub repository,
// (b) pushing somewhere it should not, (c) installing things on the developer's
// machine, or (d) deleting Ultima VII game data and savegames. It is NOT a
// sandbox against deliberate obfuscation (eval of built strings, shell
// variables, scripts written to disk and executed, aliases, ...). The real
// boundaries are token scope, the Hive GitHub App's repository access, branch
// protection and review of the changes (docs/risk-tiers.md,
// docs/agent-boundaries.md); findings that need deliberate obfuscation are out
// of scope here.
//
// Why: Danathar/exult is a fork of exult/exult. `gh` resolves the target of a
// bare `gh pr create` or `gh issue create` from the fork's parent, so an agent
// that forgets `--repo Danathar/exult` files its pull request or issue on the
// upstream project. The same goes for `git push` and extra remotes. The engine
// is a C++ program that is built in the tree: `make install` or a package
// manager would change the host, and the original game's data (the `gamedat`
// and `static` directories, savegames, the user's Exult configuration) is
// copyrighted, not reproducible from this repository, and not ours to delete.
//
// Protocol (https://docs.anthropic.com/en/docs/claude-code/hooks): the hook
// receives JSON on stdin ({ tool_name, tool_input: { command } }). Exit 0 lets
// the call proceed; exit 2 blocks it and feeds stderr back to the model.
//
// What is blocked (fail closed when unsure):
//   GitHub / git
//   - gh pr|issue|discussion|release|workflow|run|label|repo|secret|variable|
//     ruleset|cache subcommands that are not read-only and do not target
//     Danathar/exult via --repo/-R or a GH_REPO= prefix (this includes
//     `gh pr create` and `gh issue create` without --repo); a write whose
//     arguments name a github.com URL of another repository.
//   - gh pr merge (Hive merges; agents never do), `gh repo` writes, and
//     `gh secret|variable|ruleset` writes (owner administration).
//   - gh api with a mutating method (or -f/-F/--input body) against anything
//     outside repos/Danathar/exult; GraphQL mutations.
//   - gh pr create without an explicit `--base master` and `--head <branch>`.
//   - git push with force, --mirror, --delete, a remote other than `origin`, a
//     URL remote, no explicit remote, or master as the destination.
//   - git remote add (the only remote is `origin`, and there is no upstream
//     remote), and anything that removes or re-points `origin`.
//   - git config / git remote changes that re-point `origin` or push URLs.
//   - git clean with -x/-X (it would delete the ignored `gamedat` directory).
//   - git options that write a file, read outside the repository or run a
//     program on the pre-approved read commands: --output[=FILE], --no-index,
//     --ext-diff, git grep -O/--open-files-in-pager, --exec-path=DIR, and
//     `-c` keys such as diff.external, core.pager, alias.*; GIT_* / PAGER /
//     EDITOR variables (inline or exported) other than identity and no-op
//     pagers (GIT_EXTERNAL_DIFF=, GIT_TRACE=FILE, GIT_DIR=, ...).
//   - git, node, curl/wget or a shell run through xargs: xargs appends words
//     read at run time, so none of the argument checks here could see them.
//   node
//   - `node --test` with any option outside the test-runner allowlist
//     (--import, --require/-r, --loader, module reporters,
//     --test-reporter-destination=FILE, ...), and node with NODE_OPTIONS or
//     another NODE_* variable set inline or exported.
//   `bash -n` (pre-approved syntax check) with a word beginning with + or one
//   bash could expand into such a word ({, }, *, ?, [, $, backtick).
//   Host-modifying commands
//   - sudo / doas / pkexec / run0 / su in any position of a wrapper chain,
//     including behind systemd-run and flatpak-spawn.
//   - `make install`, `uninstall`, `install-*` goals (also gmake, `cmake
//     --install`, `ninja install`, `meson install`) unless DESTDIR is a
//     directory under /tmp or /var/tmp.
//   - package managers that change the system: apt, dnf, yum, zypper, pacman,
//     rpm-ostree, apk, brew, snap, flatpak, dpkg, rpm and similar, with an
//     install/remove/upgrade style subcommand; `npm|pnpm install -g`,
//     `yarn global`, `cargo install`, `pip install --user|--break-system-packages`.
//   - piping a download into a shell (`curl ... | bash`), and sourcing a
//     process substitution (`source <(curl ...)`).
//   Game data
//   - rm, rmdir, unlink, shred, mv and `find -delete|-exec` naming Ultima VII
//     game data, savegames or the user's Exult configuration (gamedat/,
//     the repository-root static/, *.sav, savegame paths, ~/.exult,
//     ~/.config/exult, ~/.local/share/exult, ultima7 / serpent isle / black
//     gate / forge of virtue directories, /usr/share/**/exult), and a
//     recursive rm of /, ~ or $HOME.
//
// Parsing notes: redirections (`>log`, `2>&1`, `&>f`, `<file`) end the word and
// are not arguments. Quoted heredoc bodies are data. Wrappers (env, timeout,
// xargs, ...) are looked through to the command they run, not to a later
// argument. Deliberate obfuscation (variables, built strings, scripts written
// then run) stays out of scope. Read-only gh commands (view, list, status,
// diff, checks, api GET, ...) are always allowed. The command is split into
// segments on && || ; | & newlines, subshells and command substitutions;
// shell -c / eval strings are analysed recursively. Quoted text is data, so a
// quoted "sudo" inside an `echo` or a read-only command is fine.

import { basename, resolve } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REPO = 'danathar/exult';

// Shell redirection operators (`>`, `>>`, `>&`, `>|`, `&>`, `&>>`, `<`, `<&`, `<>`, `<<<`; `<<` heredocs are handled separately).
const REDIRECT = /^(?:&>>?|<<<|<&|<>|>>|>&|>\||<|>)/;

const GUIDANCE =
    'Hard rules for this repository (a fork of exult/exult): GitHub writes go to Danathar/exult only ' +
    '(add `--repo Danathar/exult`; gh defaults a fork to its upstream parent), git pushes go to `origin` and never to master, ' +
    'no upstream remote, no sudo, no `make install` or system package installs, and never delete Ultima VII game data or savegames. ' +
    'See docs/agent-boundaries.md.';

// gh command groups whose non-read actions mutate a repository.
// Value = actions that are read-only (or purely local) and need no --repo.
const GH_GROUPS = {
    pr: ['view', 'list', 'status', 'diff', 'checks', 'checkout'],
    issue: ['view', 'list', 'status'],
    release: ['view', 'list', 'download', 'verify', 'verify-asset'],
    workflow: ['view', 'list'],
    run: ['view', 'list', 'watch', 'download'],
    label: ['list'],
    repo: ['view', 'list', 'clone', 'gitignore', 'license'],
    secret: ['list'],
    variable: ['list', 'get'],
    ruleset: ['list', 'view', 'check'],
    cache: ['list'],
    discussion: ['view', 'list'],
    codespace: ['list', 'view', 'logs', 'ports'],
};

// gh groups outside GH_GROUPS that may run without a repo target.
// true = every action is read-only or local; array = only those actions.
const GH_OTHER_READONLY = {
    auth: ['status'],
    browse: true,
    search: true,
    status: true,
    config: ['get', 'list'],
    alias: ['list'],
    extension: ['list', 'search', 'browse'],
    'ssh-key': ['list'],
    'gpg-key': ['list'],
    org: ['list'],
    project: ['list', 'view', 'field-list', 'item-list'],
    attestation: ['verify', 'inspect', 'trusted-root'],
    completion: true,
    help: true,
    version: true,
};

// Words that may precede the real command and carry no meaning for us.
const KEYWORDS = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until', 'time']);
// Wrappers that run another command; we look through them for gh/git/shells.
const WRAPPERS = new Set([
    'env', 'command', 'builtin', 'exec', 'nohup', 'sudo', 'nice', 'xargs',
    'timeout', 'setsid', 'stdbuf', 'ionice', 'chronic',
]);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Split a shell command line into segments of words.
 * Quotes and backslashes are resolved; operators and parentheses end a segment;
 * heredoc bodies are skipped. This is a deliberately small approximation of
 * shell parsing, good enough to find command names and their flags.
 */
export function tokenize(input) {
    const segments = [];
    let words = [];
    let word = null; // null = no word in progress ('' = empty quoted word)
    const pendingHeredocs = [];

    let skip = null; // 'in' | 'out': the next word is a redirection target
    let stdinFrom; // target of `< file` for the current segment
    let hereString; // word of `<<< word` for the current segment
    let pendingPipe = null; // previous segment when this one is the right side of `|`
    const endWord = () => {
        if (word !== null) {
            if (skip === 'in') stdinFrom = word;
            else if (skip === 'here') hereString = word;
            else if (skip === null) words.push(word);
            skip = null;
        }
        word = null;
    };
    const endSegment = (pipe = false) => {
        endWord();
        skip = null;
        if (words.length || stdinFrom !== undefined) {
            words.stdinFrom = stdinFrom;
            words.hereString = hereString;
            words.pipedFrom = pendingPipe;
            segments.push(words);
            pendingPipe = pipe ? words : null;
        }
        stdinFrom = undefined;
        hereString = undefined;
        words = [];
    };
    const append = (ch) => {
        word = (word ?? '') + ch;
    };

    let i = 0;
    while (i < input.length) {
        const c = input[i];

        if (c === "'") {
            const end = input.indexOf("'", i + 1);
            const stop = end === -1 ? input.length : end;
            append(input.slice(i + 1, stop));
            i = stop + 1;
        } else if (c === '"') {
            i++;
            append('');
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '$' && input[i + 1] === '(') {
                    // A substitution body may contain quotes of its own; it is analysed separately.
                    // Its text stays in the word (a `bash -c "$(cat x)"` script is re-analysed from it).
                    const end = closeParen(input, i + 2);
                    append(input.slice(i, end));
                    i = end;
                    continue;
                }
                if (input[i] === '\\' && i + 1 < input.length) {
                    const next = input[i + 1];
                    if ('"\\$`'.includes(next)) i++;
                    else if (next === '\n') {
                        i += 2;
                        continue;
                    }
                }
                append(input[i]);
                i++;
            }
            i++;
        } else if (c === '\\') {
            if (input[i + 1] === '\n') {
                i += 2; // line continuation
            } else {
                append(input[i + 1] ?? '');
                i += 2;
            }
        } else if (c === '#' && word === null) {
            while (i < input.length && input[i] !== '\n') i++; // comment
        } else if (c === '\n') {
            endSegment();
            i++;
            // Skip the bodies of heredocs started on the line that just ended.
            // The body is kept on the segment that started the heredoc: a shell
            // reading it runs it, so it is analysed as a command line.
            while (pendingHeredocs.length) {
                const { delim, seg } = pendingHeredocs.shift();
                const bodyStart = i;
                let bodyEnd = input.length;
                while (i < input.length) {
                    let eol = input.indexOf('\n', i);
                    if (eol === -1) eol = input.length;
                    const lineStart = i;
                    const line = input.slice(i, eol).replace(/^\t+/, '');
                    i = eol + 1;
                    if (line === delim) {
                        bodyEnd = lineStart;
                        break;
                    }
                }
                seg.heredocBody = (seg.heredocBody ?? '') + input.slice(bodyStart, bodyEnd);
            }
        } else if (c === '<' && input[i + 1] === '<' && input[i + 2] !== '<') {
            const { delim, next } = readHeredocStart(input, i);
            i = next;
            endWord();
            if (delim) pendingHeredocs.push({ delim, seg: words });
        } else if ((c === '<' || c === '>') && input[i + 1] === '(') {
            // Process substitution `<(cmd)` / `>(cmd)`: an argument; its body is analysed separately.
            append('/dev/fd/N');
            i = closeParen(input, i + 2);
        } else if ((c === '<' || c === '>' || c === '&') && REDIRECT.test(input.slice(i, i + 3))) {
            // Redirections end the word and are not arguments: `./x.sh>log`, `2>&1`,
            // `&>f`, `<file`. The target word is consumed (and remembered for `<`).
            const op = REDIRECT.exec(input.slice(i, i + 3))[0];
            if (word !== null && /^\d+$/.test(word)) word = null; // fd number: `2>`
            endWord();
            skip = op === '<<<' ? 'here' : op.startsWith('<') ? 'in' : 'out';
            i += op.length;
        } else if (c === ' ' || c === '\t') {
            endWord();
            i++;
        } else if (c === '|') {
            const dbl = input[i + 1] === '|';
            endSegment(!dbl);
            i += dbl || input[i + 1] === '&' ? 2 : 1;
        } else if (c === '&' || c === ';' || c === '(' || c === ')') {
            endSegment();
            i++;
        } else if (c === '`') {
            // Substitution contents are analysed separately; the enclosing
            // command line carries on after the closing backtick.
            append('$()');
            const end = input.indexOf('`', i + 1);
            i = end === -1 ? input.length : end + 1;
        } else if (c === '$' && input[i + 1] === '(') {
            append('$()');
            i = closeParen(input, i + 2);
        } else {
            append(c);
            i++;
        }
    }
    endSegment();
    return segments;
}

/**
 * Find the bodies of $(...) and `...` substitutions, including ones inside
 * double quotes (but not single quotes), so they can be analysed as commands.
 */
export function extractSubstitutions(input) {
    const found = [];
    let inSingle = false;
    let inDouble = false;
    const pending = []; // heredocs started on the current line
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (c === '\\' && !inSingle) {
            i++;
        } else if (c === "'" && !inDouble) {
            inSingle = !inSingle;
        } else if (c === '"' && !inSingle) {
            inDouble = !inDouble;
        } else if (!inSingle && !inDouble && c === '<' && input[i + 1] === '<' && input[i + 2] !== '<') {
            const h = readHeredocStart(input, i);
            if (h.delim) pending.push(h);
            i = h.next - 1;
        } else if (!inSingle && !inDouble && c === '\n' && pending.length) {
            // A quoted heredoc body is data (Markdown backticks in a PR body are not
            // commands). An unquoted body is expanded by the shell, so it is scanned.
            while (pending.length && pending[0].quoted) i = skipHeredocBody(input, i + 1, pending.shift().delim) - 1;
            pending.length = 0;
        } else if (!inSingle && (c === '$' || (!inDouble && (c === '<' || c === '>'))) && input[i + 1] === '(') {
            const j = closeParen(input, i + 2);
            found.push(input.slice(i + 2, j - 1));
            i = j - 1; // nested substitutions are found by the recursive analysis
        } else if (!inSingle && c === '`') {
            const end = input.indexOf('`', i + 1);
            const stop = end === -1 ? input.length : end;
            found.push(input.slice(i + 1, stop));
            i = stop;
        }
    }
    return found;
}

/**
 * Index just past the `)` that closes a substitution whose body starts at `j`,
 * ignoring parens in quotes, escaped, or in heredoc bodies.
 */
function closeParen(input, j) {
    let depth = 1;
    let q = null;
    const inner = [];
    for (; j < input.length && depth > 0; j++) {
        const d = input[j];
        if (d === '\\' && q !== "'") j++;
        else if (q) {
            if (d === q) q = null;
        } else if (d === "'" || d === '"') q = d;
        else if (d === '<' && input[j + 1] === '<' && input[j + 2] !== '<') {
            const h = readHeredocStart(input, j);
            if (h.delim) inner.push(h);
            j = h.next - 1;
        } else if (d === '\n' && inner.length) {
            while (inner.length) j = skipHeredocBody(input, j + 1, inner.shift().delim) - 1;
        } else if (d === '(') depth++;
        else if (d === ')') depth--;
    }
    return j;
}

/** Parse `<<[-]['"]DELIM['"]` at input[i]; returns { delim, quoted, next } (next = index after it). */
function readHeredocStart(input, i) {
    i += 2;
    if (input[i] === '-') i++;
    while (input[i] === ' ' || input[i] === '\t') i++;
    let delim = '';
    let quote = null;
    let quoted = false;
    while (i < input.length) {
        const d = input[i];
        if (quote) {
            if (d === quote) quote = null;
            else delim += d;
        } else if (d === "'" || d === '"') {
            quote = d;
            quoted = true;
        } else if (d === '\\') {
            quoted = true;
            delim += input[i + 1] ?? '';
            i++;
        } else if (/[\s;&|()<>]/.test(d)) break;
        else delim += d;
        i++;
    }
    return { delim, quoted, next: i };
}

/** Index just past the line that closes a heredoc whose body starts at `i`. */
function skipHeredocBody(input, i, delim) {
    while (i < input.length) {
        let eol = input.indexOf('\n', i);
        if (eol === -1) eol = input.length;
        const line = input.slice(i, eol).replace(/^\t+/, '');
        i = eol + 1;
        if (line === delim) break;
    }
    return i;
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isAssignment = (w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w);

/** Normalise OWNER/REPO, HOST/OWNER/REPO, or a github URL to "owner/repo". */
export function normalizeRepo(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/^(?:https?:\/\/|git@|ssh:\/\/git@)?github\.com[/:]/, '')
        .replace(/\.git$/, '')
        .replace(/\/+$/, '');
}

/** True if a word is a github.com URL (or git@/ssh form) for a repository other than REPO. */
export function namesOtherRepo(word) {
    const m = /^(?:https?:\/\/|git@|ssh:\/\/git@)github\.com[/:]([^/\s]+\/[^/\s]+?)(?:\.git)?(?:\/.*)?$/i.exec(
        String(word)
    );
    return m !== null && m[1].toLowerCase() !== REPO;
}

function isTarget(value) {
    return normalizeRepo(value) === REPO;
}

/**
 * Extract the effective --repo/-R value from gh args, or null. gh honours the
 * LAST repeated flag, so a fork flag followed by another repo must not pass:
 * if any value is not the fork, that one is returned; otherwise the last.
 */
function repoFlag(args) {
    const values = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--repo' || a === '-R') values.push(args[++i] ?? '');
        else if (a.startsWith('--repo=')) values.push(a.slice(7));
        else if (a.startsWith('-R') && a.length > 2 && !a.startsWith('--')) values.push(a.slice(2));
    }
    if (!values.length) return null;
    return values.find((v) => !isTarget(v)) ?? values[values.length - 1];
}

const block = (reason) => ({ blocked: true, reason: `${reason}\n${GUIDANCE}` });
// ---------------------------------------------------------------------------
// gh
// ---------------------------------------------------------------------------

function checkGhApi(args) {
    let method = null;
    let hasBody = false;
    const positionals = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '-X' || a === '--method') method = (args[++i] ?? '').toUpperCase();
        else if (a.startsWith('--method=')) method = a.slice(9).toUpperCase();
        else if (/^-X./.test(a)) method = a.slice(2).toUpperCase();
        else if (['-f', '-F', '--field', '--raw-field', '--input'].includes(a)) {
            hasBody = true;
            i++;
        } else if (/^--(field|raw-field|input)=/.test(a) || /^-[fF]./.test(a)) hasBody = true;
        else if (['-H', '--header', '--hostname', '-q', '--jq', '-t', '--template', '--cache'].includes(a)) i++;
        else if (!a.startsWith('-')) positionals.push(a);
    }
    const endpoint = (positionals[0] ?? '').replace(/^\/+/, '');
    const mutating = method ? !['GET', 'HEAD'].includes(method) : hasBody;
    const isGraphql = endpoint.toLowerCase() === 'graphql';

    if (isGraphql) {
        // GraphQL is always POST; allow queries, refuse mutations (target unknowable).
        if (args.some((a) => /\bmutation\b/i.test(a))) {
            return block('Blocked: `gh api graphql` mutation. The target repository cannot be verified.');
        }
        // The query must be a visible literal: a body from a file/stdin (--input,
        // query=@file) or a shell variable could hide a mutation.
        const query = args.map((a) => /^query=([\s\S]*)$/.exec(a)).find(Boolean);
        const opaque =
            args.some((a) => a === '--input' || a.startsWith('--input=')) ||
            !query ||
            /^[@$]/.test(query[1]);
        if (opaque) {
            return block('Blocked: `gh api graphql` without an inline literal `-f query=...`; the request cannot be inspected for mutations.');
        }
        return null;
    }
    if (!mutating) return null;

    // `{owner}/{repo}` placeholders resolve to gh's default repo, which may be a different repository.
    const m = /^repos\/([^/]+\/[^/?#]+)(?:[/?#]|$)/i.exec(endpoint);
    if (m && m[1].toLowerCase() === REPO) return null;

    return block(
        `Blocked: mutating \`gh api\` call (${method ?? 'implicit POST'}) to "${endpoint || '?'}"; ` +
            'only paths under repos/Danathar/exult are allowed.'
    );
}

function checkGh(args, envRepo) {
    // Locate group and action (first two non-flag words).
    // The value of --repo/-R is not a command word, wherever the flag sits
    // (`gh -R chrisvel/tududi pr create` must still resolve to group "pr").
    const plain = args.filter((a, n) => !a.startsWith('-') && !['--repo', '-R'].includes(args[n - 1]));
    const group = plain[0];
    if (!group) return null;

    if (group === 'api') return checkGhApi(args.slice(args.indexOf('api') + 1));
    if (!Object.hasOwn(GH_GROUPS, group)) {
        // Fail closed: groups outside GH_GROUPS pass only via the explicit
        // read-only allowlist (GH_OTHER_READONLY). This also covers `gh alias set`,
        // which could define an alias that hides a write.
        const allowed = GH_OTHER_READONLY[group];
        if (allowed === true || (Array.isArray(allowed) && allowed.includes(plain[1] ?? ''))) return null;
        return block(
            `Blocked: \`gh ${group} ${plain[1] ?? ''}\` is not on the read-only allowlist ` +
                '(unknown or mutating gh command; the target repository cannot be verified).'
        );
    }

    const action = plain[1] ?? '';
    const flagRepo = repoFlag(args);
    const target = flagRepo ?? envRepo;

    if (group === 'repo' && action === 'set-default') {
        const rest = plain.slice(2);
        if (args.includes('--view') || args.includes('-v')) return null;
        if (rest.length === 1 && isTarget(rest[0])) return null;
        return block('Blocked: `gh repo set-default` must be `gh repo set-default Danathar/exult` (or --view).');
    }

    if (GH_GROUPS[group].includes(action)) return null; // read-only

    if (group === 'pr' && action === 'merge') {
        return block('Blocked: `gh pr merge`. Agents never merge; Hive merges after the required checks pass, and the owner reviews owner-review paths.');
    }
    if (['secret', 'variable', 'ruleset'].includes(group) || (group === 'repo' && action !== 'set-default')) {
        return block(`Blocked: \`gh ${group} ${action}\` is repository administration; only the owner does that.`);
    }

    // A write whose arguments name another repository's github.com URL
    // (`gh pr merge https://github.com/other/x/pull/1`): gh uses the URL, not
    // --repo, so it is refused even when --repo points at this repository.
    const other = args.find(namesOtherRepo);
    if (other !== undefined) {
        return block(`Blocked: \`gh ${group} ${action}\` names another repository ("${other}").`);
    }


    if (target === null) {
        return block(`Blocked: \`gh ${group} ${action}\` has no --repo/-R/GH_REPO; gh would resolve the repository from git remotes or its default.`);
    }
    if (!isTarget(target)) {
        return block(`Blocked: \`gh ${group} ${action}\` targets "${target}", not Danathar/exult.`);
    }
    if (group === 'pr' && action === 'create') return checkPrCreate(args);
    return null;
}

/** Convention: PRs are created with an explicit `--base master` and `--head <branch>`. */
function checkPrCreate(args) {
    // Flags whose value must be skipped so e.g. `--body "-Bump deps"` is not read as `-B`.
    const takesValue = new Set([
        '--title', '-t', '--body', '-b', '--body-file', '-F', '--label', '-l', '--assignee', '-a',
        '--reviewer', '-r', '--milestone', '-m', '--project', '-p', '--template', '-T',
    ]);
    const flagValue = (long, short) => {
        let found = null;
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === long || a === short) found = args[i + 1] ?? '';
            else if (a.startsWith(`${long}=`)) found = a.slice(long.length + 1);
            else if (a.startsWith(short) && a.length > 2 && !a.startsWith('--')) found = a.slice(2); // -Bdevelop
            if (a === long || a === short || takesValue.has(a)) i++; // skip this flag's value
        }
        return found; // gh honours the last occurrence of a repeated flag
    };
    const base = flagValue('--base', '-B');
    const head = flagValue('--head', '-H');
    if (base !== 'master') {
        return block('Blocked: `gh pr create` needs an explicit `--base master`.');
    }
    if (!head) {
        return block('Blocked: `gh pr create` needs an explicit `--head <branch>`.');
    }
    return null;
}
// ---------------------------------------------------------------------------
// git
// ---------------------------------------------------------------------------

// git config keys that can redirect where a push goes or how it authenticates.
// (push.* keys such as push.default or push.autoSetupRemote cannot change the target.)
const RISKY_GIT_CONFIG = /^(remote\.|url\.|credential\.|core\.sshcommand$)/i;
// `-c` keys that make git run a program or read config from elsewhere
// (`git -c diff.external=prog diff`, `-c core.pager=...`, `-c alias.x=!cmd`).
const EXEC_GIT_CONFIG =
    /^(core\.(pager|editor|fsmonitor|hookspath|askpass|gitproxy|attributesfile)$|diff\.|pager\.|alias\.|sequence\.editor$|gpg\.|filter\.|merge\.|interactive\.|include\.|includeif\.|uploadpack\.)/i;
// Options that turn a read-only git command (`git diff|log|show`, allow-listed in
// .claude/settings.json) into a file write (`--output=FILE`), a read of any path
// on disk (`--no-index`) or a program run (`--ext-diff`, git grep's
// `--open-files-in-pager`). git rejects abbreviations of these diff options
// (`--outp=` exits 128/129 and writes nothing), so the full spelling is enough;
// `--output-indicator-*` and `--no-ext-diff` do not match.
const REFUSED_GIT_OPTION = /^--(?:output|no-index|ext-diff|open-files-in-pager)(?:=|$)/;

// Environment variables git or node read to run a program, load code, write a
// file or switch repository/config (`GIT_EXTERNAL_DIFF=prog git diff`,
// `GIT_TRACE=FILE`, `GIT_DIR=...`, `NODE_OPTIONS=--import=...`,
// `NODE_V8_COVERAGE=DIR`). Fail closed: every GIT_* / NODE_* name is refused
// unless SAFE_ENV lists it.
const WATCHED_ENV = /^(GIT_|NODE_|PAGER$|EDITOR$|VISUAL$|LESSOPEN$|LESSCLOSE$)/;
const SAFE_ENV = new Set([
    'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_AUTHOR_DATE', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
    'GIT_COMMITTER_DATE', 'GIT_TERMINAL_PROMPT', 'GIT_OPTIONAL_LOCKS', 'GIT_MERGE_AUTOEDIT', 'GIT_FLUSH',
    'NODE_ENV', 'NODE_NO_WARNINGS', 'NODE_DISABLE_COLORS',
]);
// Program-valued variables that are harmless only with a no-op value (`GIT_PAGER=cat`).
const PROGRAM_ENV = new Set(['GIT_PAGER', 'PAGER', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'EDITOR', 'VISUAL']);
const NOOP_PROGRAMS = new Set(['', 'cat', 'true', ':']);

/** Name of the first risky variable in an env map ({ NAME: value | null }), or undefined. */
function riskyEnv(env) {
    return Object.keys(env).find((k) => {
        if (!WATCHED_ENV.test(k) || SAFE_ENV.has(k)) return false;
        if (PROGRAM_ENV.has(k)) return !NOOP_PROGRAMS.has(env[k]);
        return true;
    });
}

function checkGit(args, inlineEnv = {}, exported = {}) {
    // Walk global options to find the subcommand, vetting `-c key=value`.
    let i = 0;
    while (i < args.length && args[i].startsWith('-')) {
        const a = args[i];
        let configKey = null;
        if (a === '-c' || a === '--config-env') configKey = (args[i + 1] ?? '').split('=')[0];
        else if (a.startsWith('--config-env=')) configKey = a.slice(13).split('=')[0];
        if (configKey !== null && RISKY_GIT_CONFIG.test(configKey)) {
            return block(`Blocked: \`git ${a} ${configKey}=...\` could redirect pushes or credentials.`);
        }
        if (configKey !== null && EXEC_GIT_CONFIG.test(configKey)) {
            return block(`Blocked: \`git ${a} ${configKey}=...\` makes git run a program or read other config.`);
        }
        if (a.startsWith('--exec-path=')) {
            return block('Blocked: `git --exec-path=DIR` runs git commands from another directory.');
        }
        i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env'].includes(a) ? 2 : 1;
    }
    const sub = args[i];
    const rest = args.slice(i + 1);

    const env = { ...exported, ...inlineEnv };
    if (sub === 'push') {
        const pushKey = Object.keys(env).find((k) => /^(GIT_CONFIG_|GIT_SSH)/i.test(k));
        if (pushKey) return block(`Blocked: \`git push\` with ${pushKey}= could redirect the push.`);
    }
    const envKey = riskyEnv(env);
    if (envKey) {
        return block(
            `Blocked: \`git\` with ${envKey} set; it can make git run a program, write a file or read another repository/config. ` +
                'Only GIT_AUTHOR_*/GIT_COMMITTER_* identity and PAGER/GIT_PAGER/GIT_EDITOR=cat|true are allowed.'
        );
    }
    const refused = args.find((a) => REFUSED_GIT_OPTION.test(a)) ?? (sub === 'grep' ? rest.find((a) => /^-[a-zA-Z]*O/.test(a)) : undefined);
    if (refused !== undefined) {
        return block(
            `Blocked: \`git ${sub ?? ''} ${refused}\` writes a file, reads outside the repository or runs a program. ` +
                'Read the output on stdout instead (pipe it, or use the Write tool to save it).'
        );
    }
    if (sub === 'push') return checkGitPush(rest);
    if (sub === 'remote') return checkGitRemote(rest);
    if (sub === 'clean' && rest.some((a) => /^-[a-zA-Z]*[xX]/.test(a))) {
        return block('Blocked: `git clean -x/-X` deletes ignored files, including a gitignored `gamedat` directory with saves.');
    }
    if (sub === 'config') return checkGitConfig(rest);
    return null;
}

/** Writes to push-redirecting config keys (`git config remote.origin.url ...`). */
function checkGitConfig(rest) {
    const readOnly = ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l', '--show-origin', '--show-scope'];
    if (rest.some((a) => readOnly.includes(a))) return null;

    // Collect positionals, skipping the values of options that take one
    // (`git config -f .git/config remote.origin.url <url>`).
    const valueFlags = ['-f', '--file', '--blob', '--type', '--default', '--comment', '--value', '--url'];
    const positionals = [];
    for (let k = 0; k < rest.length; k++) {
        const a = rest[k];
        if (valueFlags.includes(a)) k++;
        else if (!a.startsWith('-')) positionals.push(a);
    }

    // Modern syntax: `git config set|unset|replace-all|... <key> [value]`.
    const verbs = ['set', 'unset', 'replace-all', 'add', 'rename-section', 'remove-section', 'edit'];
    const readVerbs = ['get', 'list'];
    let modifies = false;
    const verbRenames = positionals[0] === 'rename-section';
    if (positionals.length && readVerbs.includes(positionals[0])) return null;
    if (positionals.length && verbs.includes(positionals[0])) {
        if (positionals[0] === 'edit') {
            return block('Blocked: `git config edit` could redirect pushes or credentials.');
        }
        positionals.shift();
        modifies = true;
    }
    const key = positionals[0];
    // Legacy syntax: a write is `key value`, or --unset/--add/--replace-all/section edits.
    modifies =
        modifies ||
        positionals.length > 1 ||
        rest.some((a) => /^--(unset|unset-all|add|replace-all|remove-section|rename-section)$/.test(a));
    if (key !== undefined && RISKY_GIT_CONFIG.test(key) && modifies) {
        return block(`Blocked: \`git config ${key}\` write could redirect pushes or credentials.`);
    }
    // Section renames move settings between names: check both the old and the new
    // section (`git config rename-section foo remote.origin` adopts foo.pushurl).
    const renames = verbRenames || rest.includes('--rename-section');
    if (renames && positionals.some((p) => RISKY_GIT_CONFIG.test(`${p}.x`))) {
        return block('Blocked: `git config rename-section` involving a remote/url/credential section could redirect pushes.');
    }
    if (rest.includes('--edit') || rest.includes('-e')) {
        return block('Blocked: `git config --edit` could redirect pushes or credentials.');
    }
    return null;
}

// Long `git push` options that force, mirror, delete or redirect. git accepts any
// unambiguous abbreviation of a long option (`--force-w`, `--del`, `--mirr`), so a
// word that is a prefix of one of these is refused, not just the full spelling.
const PUSH_DANGER = [
    ['--force', 'force push'], ['--force-with-lease', 'force push'], ['--force-if-includes', 'force push'],
    ['--mirror', '`git push --mirror` overwrites the remote'], ['--delete', 'deleting remote refs'],
    ['--prune', 'deleting remote refs (--prune)'], ['--repo', '`git push --repo` redirects the push; name the remote `origin` instead'],
];

function checkGitPush(rest) {
    const positionals = [];
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (['-o', '--push-option', '--receive-pack', '--exec'].includes(a)) {
            i++;
            continue;
        }
        if (a.startsWith('--') && a.length > 2) {
            const name = a.split('=')[0];
            const hit = name.length >= 3 ? PUSH_DANGER.find(([full]) => full.startsWith(name)) : undefined;
            if (hit) return block(`Blocked: \`git push ${a}\`: ${hit[1]}.`);
        } else if (/^-[a-zA-Z]*f[a-zA-Z]*$/.test(a)) {
            return block('Blocked: force push (-f).');
        } else if (/^-[a-zA-Z]*d[a-zA-Z]*$/.test(a)) {
            return block('Blocked: `git push -d` deletes remote refs.');
        } else if (!a.startsWith('-')) positionals.push(a);
    }
    const [remote, ...refspecs] = positionals;
    if (remote === undefined) {
        return block('Blocked: `git push` without an explicit remote; use `git push origin <branch>`.');
    }
    if (remote !== 'origin') {
        return block(`Blocked: \`git push ${remote}\`; only the \`origin\` remote may be pushed to.`);
    }
    if (refspecs.some((r) => r.startsWith('+'))) {
        return block('Blocked: force push via "+" refspec.');
    }
    const toMaster = (r) => /^(?:refs\/heads\/)?master$/.test(r.includes(':') ? r.slice(r.lastIndexOf(':') + 1) : r);
    if (refspecs.some(toMaster)) {
        return block('Blocked: pushing to master. Push a branch and open a PR; Hive merges.');
    }
    if (refspecs.some((r) => r.startsWith(':'))) {
        return block('Blocked: `git push origin :ref` deletes a remote ref.');
    }
    return null;
}

function checkGitRemote(rest) {
    const sub = rest[0];
    const flags = [];
    const plain = [];
    for (let k = 1; k < rest.length; k++) {
        const a = rest[k];
        if (a.startsWith('-')) {
            flags.push(a);
            if (['-t', '-m', '--track', '--master'].includes(a)) k++; // option takes a value
        } else plain.push(a);
    }
    const [name, url] = plain;
    const originHint =
        '`origin` is https://github.com/Danathar/exult; it must not be removed, renamed or re-pointed.';

    // Anything that could remove, replace or re-point `origin` would defeat the
    // "push only to origin" rule (`git push origin` would then reach another repo).
    if (['remove', 'rm', 'rename'].includes(sub) && plain.includes('origin')) {
        return block(`Blocked: \`git remote ${sub}\` involving origin. ${originHint}`);
    }
    if (sub === 'add' && name === 'origin' && !isTarget(url ?? '')) {
        return block(`Blocked: \`git remote add origin\` with a URL that is not this repository. ${originHint}`);
    }
    if (sub === 'add' && name !== 'origin') {
        return block(
            `Blocked: \`git remote add ${name ?? ''}\`. The only remote is \`origin\` (Danathar/exult); there is no upstream remote and none may be added. ${originHint}`
        );
    }
    if (sub !== 'set-url') return null;
    if (url === undefined) return null;
    const push = flags.includes('--push');
    if (push && url !== 'DISABLE' && !(name === 'origin' && isTarget(url))) {
        return block(
            `Blocked: \`git remote set-url --push ${name}\` to a real URL. ` +
                'Use `DISABLE`, or the Danathar/exult URL for origin.'
        );
    }
    if (name === 'origin' && !isTarget(url)) {
        return block(`Blocked: \`origin\` may only point at https://github.com/Danathar/exult.`);
    }
    return null;
}
// ---------------------------------------------------------------------------
// node --test
// ---------------------------------------------------------------------------

// `node --test` is pre-approved in .claude/settings.json, but node options load
// and run any code (`--import`, `--require`/`-r`, `--loader`, a module
// `--test-reporter`, `--test-global-setup`, `--experimental-config-file`) or
// write files (`--test-reporter-destination=FILE`, `--cpu-prof-dir`,
// `--redirect-warnings`). In test mode only the test-runner options below are
// allowed; everything else, and any NODE_* variable such as NODE_OPTIONS, is
// refused. Value: null = any value, RegExp = the value must match.
const NODE_TEST_OPTIONS = {
    '--test': false,
    '--test-only': false,
    '--watch': false,
    '--test-force-exit': false,
    '--experimental-test-coverage': false,
    '--no-warnings': false,
    '--enable-source-maps': false,
    '--test-name-pattern': null,
    '--test-skip-pattern': null,
    '--test-coverage-include': null,
    '--test-coverage-exclude': null,
    '--test-concurrency': /^\d+$/,
    '--test-timeout': /^\d+$/,
    '--test-shard': /^\d+\/\d+$/,
    '--test-isolation': /^(process|none)$/,
    '--experimental-test-isolation': /^(process|none)$/,
    '--test-coverage-lines': /^\d+(\.\d+)?$/,
    '--test-coverage-branches': /^\d+(\.\d+)?$/,
    '--test-coverage-functions': /^\d+(\.\d+)?$/,
    '--test-reporter': /^(spec|tap|dot|junit|lcov)$/,
    '--test-reporter-destination': /^(stdout|stderr)$/,
};

function checkNode(cmd, args, env) {
    const envKey = Object.keys(env).find((k) => /^NODE_/.test(k) && !SAFE_ENV.has(k));
    if (envKey) {
        return block(`Blocked: \`${cmd}\` with ${envKey} set; NODE_OPTIONS and other NODE_* variables can load code or write files.`);
    }
    // (no inline-code checks: node -e is not pre-approved, so Claude Code asks)
    if (!args.includes('--test')) return null; // not the pre-approved test runner; Claude Code asks
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a.startsWith('-') || a === '-' || a === '--') continue; // test files / patterns
        const eq = a.indexOf('=');
        const name = eq === -1 ? a : a.slice(0, eq);
        const rule = Object.hasOwn(NODE_TEST_OPTIONS, name) ? NODE_TEST_OPTIONS[name] : undefined;
        let ok = rule !== undefined;
        if (ok && rule === false) ok = eq === -1;
        else if (ok) {
            const value = eq === -1 ? args[++i] : a.slice(eq + 1);
            ok = value !== undefined && (rule === null || rule.test(value));
        }
        if (!ok) {
            return block(
                `Blocked: \`${cmd} --test ... ${a}\`; only test-runner options (name/skip pattern, concurrency, timeout, shard, ` +
                    'isolation, coverage, --watch, --test-only, reporters spec|tap|dot|junit|lcov to stdout|stderr) are allowed. ' +
                    'Other node options can run code (--import, --require, --loader, module reporters) or write files.'
            );
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Host-modifying commands, game data
// ---------------------------------------------------------------------------

const PRIVILEGE = new Set(['sudo', 'doas', 'pkexec', 'run0', 'su']);
const NET_CLIENTS = new Set(['curl', 'wget', 'http', 'https', 'xh', 'xhs', 'aria2c']);
const MAKERS = new Set(['make', 'gmake']);

// Under xargs the command line gains words read at run time, which no check here
// sees. Only commands that are read-only whatever their arguments are may run under
// xargs; everything else (gh, git, node, python, the checker, curl, ...) is refused.
const XARGS_SAFE = new Set([
    'shellcheck', 'grep', 'egrep', 'fgrep', 'cat', 'wc', 'ls', 'head', 'tail', 'sort', 'uniq', 'echo', 'printf', 'true',
    'basename', 'dirname', 'stat', 'file',
]);
const XARGS_OPAQUE = (cmd) => !XARGS_SAFE.has(cmd);

/** The text a literal `echo`/`printf` writes, or undefined for any other command. */
function literalPayload(f) {
    const name = basename(f[0] ?? '');
    if (name !== 'echo' && name !== 'printf') return undefined;
    const rest = f.slice(1).filter((a) => !a.startsWith('-'));
    if (name === 'printf') rest.shift(); // the format string
    return rest.join(' ');
}

const INSTALL_GOAL = /^(?:install|uninstall|install-[\w-]+|uninstall-[\w-]+)$/;
const scratchDir = (value) => /^\/(?:var\/)?tmp\/[^$`~*?[{\\]+$/.test(value) && !value.split('/').includes('..');

/** `make install` and friends write to the host unless DESTDIR points into scratch space. */
function checkInstall(cmd, args, env) {
    const destdir = [...args.filter((a) => a.startsWith('DESTDIR=')).map((a) => a.slice(8)), ...(env.DESTDIR === undefined ? [] : [env.DESTDIR])];
    const scratch = destdir.length > 0 && destdir.every(scratchDir);
    let installing = false;
    if (MAKERS.has(cmd) || cmd === 'ninja') installing = args.some((a) => INSTALL_GOAL.test(a));
    else if (cmd === 'meson') installing = args.includes('install');
    else if (cmd === 'cmake') {
        installing = args.some((a) => a === '--install' || a.startsWith('--install=')) ||
            args.some((a, i) => (a === '--target' || a === '-t') && args[i + 1] === 'install');
    } else if (cmd === 'checkinstall') installing = true;
    if (!installing || scratch) return null;
    return block(
        `Blocked: \`${cmd} ... install\` writes to the host (/usr/local by default). Build in the tree and run from there; ` +
            'to inspect the install layout use DESTDIR=/tmp/<dir> (or /var/tmp/<dir>).'
    );
}

const PKG_MANAGERS = new Set([
    'apt', 'apt-get', 'aptitude', 'dnf', 'dnf5', 'yum', 'zypper', 'pacman', 'yay', 'paru', 'rpm-ostree', 'apk', 'brew', 'snap',
    'flatpak', 'dpkg', 'rpm', 'port', 'pkg', 'nix-env', 'emerge', 'xbps-install', 'transactional-update',
]);
const PKG_MUTATING =
    /^(?:install|reinstall|remove|uninstall|erase|purge|upgrade|update|dist-upgrade|full-upgrade|autoremove|downgrade|swap|add|del|delete|override|reset|rebase|deploy|usroverlay|initramfs|kargs|refresh|-S\w*|-R\w*|-U\w*|-i|-e|--install|--erase|--upgrade|--remove)$/;

function checkPackages(cmd, args) {
    if (PKG_MANAGERS.has(cmd) && args.some((a) => PKG_MUTATING.test(a))) {
        return block(`Blocked: \`${cmd}\` with an install/remove/upgrade action changes the system's packages; ask the owner to install build dependencies.`);
    }
    const sub = args.find((a) => !a.startsWith('-'));
    const global = args.some((a) => a === '-g' || a === '--global');
    if (['npm', 'pnpm'].includes(cmd) && global && ['install', 'i', 'add', 'uninstall', 'remove', 'update', 'link'].includes(sub)) {
        return block(`Blocked: global \`${cmd}\` installs change the host; install into the project or a scratch directory.`);
    }
    if (cmd === 'yarn' && sub === 'global') return block('Blocked: `yarn global` changes the host.');
    if (cmd === 'cargo' && sub === 'install') return block('Blocked: `cargo install` writes to ~/.cargo/bin on the host.');
    if (['pip', 'pip3'].includes(cmd) && sub === 'install' && args.some((a) => /^--(user|break-system-packages|target|prefix|root)(=|$)/.test(a))) {
        return block(`Blocked: \`${cmd} install\` outside a virtual environment changes the host.`);
    }
    return null;
}

// Ultima VII game data, savegames and the user's Exult configuration. `static/`
// only counts at the repository root (content/demo/static is Exult's own demo data).
const GAME_DATA = new RegExp(
    [
        '(?:^|/)gamedat(?:/|$)',
        '^(?:\\./)?static(?:/|$)',
        '\\.sav$',
        '(?:^|/)savegame',
        '(?:^|/)\\.exult(?:\\.cfg)?(?:/|$)',
        '(?:^|/)\\.(?:config|local/share)/exult(?:/|$)',
        '/share/(?:games/)?exult(?:/|$)',
        '(?:^|/)(?:ultima[-_ ]?(?:7|vii)|serpent[-_ ]?isle|black[-_ ]?gate|forge[-_ ]?of[-_ ]?virtue)',
    ].join('|'),
    'i'
);
const ROOT_TARGET = /^(?:\/|\/\*|~\/?|~\/\*|\$\{?HOME\}?\/?|\$\{?HOME\}?\/\*|\.\.\/?|\*)$/;

function checkDelete(cmd, args) {
    const operands = args.filter((a) => !a.startsWith('-'));
    const recursive = args.some((a) => a === '--recursive' || /^-[a-zA-Z]*[rR]/.test(a));
    if (cmd === 'rm' && recursive && operands.some((a) => ROOT_TARGET.test(a))) {
        return block('Blocked: recursive `rm` of /, ~, $HOME, .. or * would delete far more than this repository.');
    }
    if (cmd === 'find') {
        if (!args.some((a) => a === '-delete' || a === '-exec' || a === '-execdir' || a === '-ok')) return null;
    }
    const hit = operands.find((a) => GAME_DATA.test(a.replace(/^\.\//, '')) || (cmd === 'find' && GAME_DATA.test(a)));
    if (hit !== undefined) {
        return block(
            `Blocked: \`${cmd} ${hit}\` would remove or move Ultima VII game data, a savegame or the user's Exult configuration. ` +
                'That data is copyrighted, not reproducible from this repository, and never the agent\'s to delete.'
        );
    }
    return null;
}
const DELETERS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'mv', 'find']);

// Options of wrapper commands that take a separate value word.
const WRAPPER_VALUE_OPTS = {
    timeout: ['-s', '--signal', '-k', '--kill-after'],
    nice: ['-n', '--adjustment'],
    xargs: ['-n', '-I', '-L', '-P', '-s', '-d', '-E', '-a', '--max-args', '--max-procs', '--delimiter', '--arg-file'],
    stdbuf: ['-i', '-o', '-e'],
    ionice: ['-c', '-n', '-p', '-P', '-u'],
    env: ['-u', '--unset', '-C', '--chdir'],
};

/** Index of the command a wrapper (env, timeout, xargs, ...) runs, or -1 if there is none to analyse. */
function wrapperTarget(w) {
    const cmd = basename(w[0]);
    if (cmd === 'command' && w.some((a) => /^-[a-zA-Z]*[vV]/.test(a))) return -1; // lookup only
    const valueOpts = WRAPPER_VALUE_OPTS[cmd] ?? [];
    let needDuration = cmd === 'timeout';
    for (let k = 1; k < w.length; k++) {
        const a = w[k];
        if (isAssignment(a) || a === '--') continue;
        if (a.startsWith('-') && a.length > 1) {
            if (valueOpts.includes(a)) k++;
            continue;
        }
        if (needDuration) {
            needDuration = false;
            continue;
        }
        return k;
    }
    return -1;
}

// Commands that systemd-run / flatpak-spawn may run and that this hook analyses.
const ANALYSED = new Set([
    'gh', 'git', 'node', 'nodejs', 'eval', 'source', '.', 'systemd-run', 'flatpak-spawn', 'cmake', 'ninja', 'meson', 'checkinstall',
    'npm', 'pnpm', 'yarn', 'cargo', 'pip', 'pip3', ...SHELLS, ...MAKERS, ...NET_CLIENTS, ...PKG_MANAGERS, ...DELETERS,
]);

function checkSegment(words, state) {
    const { pipedFrom, stdinFrom, hereString, heredocBody } = words;
    let w = words.slice();
    const inlineEnv = {};
    // Set once the segment runs through xargs: xargs appends words it reads at
    // run time, so no argument check below sees the real command line.
    let xargsFed = false;
    for (;;) {
        while (w.length && (isAssignment(w[0]) || KEYWORDS.has(w[0]))) {
            if (isAssignment(w[0])) {
                const eq = w[0].indexOf('=');
                inlineEnv[w[0].slice(0, eq)] = w[0].slice(eq + 1);
            }
            w.shift();
        }
        if (!w.length) return null;
        const cmd = basename(w[0]);
        if (PRIVILEGE.has(cmd)) {
            return block(`Blocked: \`${cmd}\` (privilege escalation) is never run by agents in this repository.`);
        }
        if (!WRAPPERS.has(cmd)) break;
        // `env -S 'gh pr create'` / `--split-string=...` runs a command string.
        // Only env's own leading options and NAME=value words are scanned; the
        // wrapped command's arguments (e.g. `--title -Sx`) are not env options.
        if (cmd === 'env') {
            for (let k = 1; k < w.length; k++) {
                const a = w[k];
                if (isAssignment(a)) continue;
                if (!a.startsWith('-')) break; // first word of the wrapped command
                if (['-u', '--unset', '-C', '--chdir'].includes(a)) {
                    k++;
                    continue;
                }
                let script = null;
                let rest = k + 1;
                if (a === '-S' || a === '--split-string') {
                    script = w[k + 1] ?? '';
                    rest = k + 2;
                } else if (a.startsWith('--split-string=')) script = a.slice(15);
                else if (/^-S./.test(a)) script = a.slice(2);
                if (script === null) continue;
                // Check the string on its own, then as the head of the command
                // that still has the remaining words appended.
                const alone = checkCommand(script, state);
                if (alone) return alone;
                const head = tokenize(script).flat();
                return checkSegment([...head, ...w.slice(rest)], state);
            }
        }
        // Look through the wrapper to the command it runs: skip its own options
        // (and their values), NAME=value words, and timeout's duration.
        const idx = wrapperTarget(w);
        for (const x of w.slice(1, idx === -1 ? w.length : idx)) {
            if (isAssignment(x)) {
                const eq = x.indexOf('=');
                inlineEnv[x.slice(0, eq)] = x.slice(eq + 1);
            }
        }
        if (idx === -1) return null;
        if (cmd === 'xargs') xargsFed = true;
        w = w.slice(idx);
    }

    const cmd = basename(w[0]);
    const args = w.slice(1);
    // `printf '%s\n' --output=FILE | xargs git log`, `printf '%s\n' +n -c CMD | xargs bash -n`
    // reach commands with arguments this hook never sees, under the allow rules and checks below.
    if (xargsFed && XARGS_OPAQUE(cmd) && !PRIVILEGE.has(cmd)) {
        return block(
            `Blocked: \`xargs ${cmd}\`; xargs adds arguments read at run time, so this hook cannot check the ` +
                `${cmd} command line the allow rules pre-approve. Write the ${cmd} command out in full instead.`
        );
    }
    // Nested analysis (`bash -c '...'`, `eval`) sees this segment's state, but
    // anything it changes stays inside it, as in a real subshell.
    const nested = () => Object.create(state);
    const env = { ...(state.exportedEnv ?? {}), ...inlineEnv };

    if (cmd === 'export' || ((cmd === 'declare' || cmd === 'typeset') && args.some((a) => /^-[a-zA-Z]*x/.test(a)))) {
        for (const a of args) {
            if (a.startsWith('GH_REPO=')) state.exportedGhRepo = a.slice(8);
            // `export NAME` without a value exports an earlier assignment: value unknown (null).
            const eq = a.indexOf('=');
            const name = eq === -1 ? a : a.slice(0, eq);
            if (/^(GIT_CONFIG_|GIT_SSH)/i.test(name) || WATCHED_ENV.test(name) || name === 'DESTDIR') {
                (state.exportedEnv ??= {})[name] = eq === -1 ? null : a.slice(eq + 1);
            }
        }
        return null;
    }
    if (cmd === 'gh') {
        const envRepo = inlineEnv.GH_REPO ?? state.exportedGhRepo ?? null;
        return checkGh(args, envRepo);
    }
    if (cmd === 'git') return checkGit(args, inlineEnv, state.exportedEnv ?? {});
    if (cmd === 'node' || cmd === 'nodejs') return checkNode(cmd, args, env);
    if (MAKERS.has(cmd) || ['ninja', 'meson', 'cmake', 'checkinstall'].includes(cmd)) return checkInstall(cmd, args, env);
    if (PKG_MANAGERS.has(cmd) || ['npm', 'pnpm', 'yarn', 'cargo', 'pip', 'pip3'].includes(cmd)) return checkPackages(cmd, args);
    if (DELETERS.has(cmd)) return checkDelete(cmd, args);
    if (cmd === 'source' || cmd === '.') {
        return args.some((a) => a.startsWith('/dev/fd/'))
            ? block('Blocked: sourcing a process substitution (`source <(curl ...)`) runs code this hook cannot inspect.')
            : null;
    }
    if (SHELLS.has(cmd)) {
        // `bash -n` is pre-approved in .claude/settings.json because -n parses a
        // script without running it, but a later `+n` or `+o noexec` turns -n off
        // again: `bash -n +n -c 'cmd'` runs cmd with no prompt. Refuse any word
        // beginning with + in a -n invocation, and any word bash could rewrite
        // into one first (`{+,+}n`, `?n` beside a file named +n, `$X`).
        if (args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a))) {
            const bad = args.find((a) => a.startsWith('+') || /[{}*?[$`]/.test(a));
            if (bad !== undefined) {
                return block(
                    `Blocked: \`${cmd} -n ... ${bad}\`; -n only parses a script, and +n or +o noexec turns that off ` +
                        'so the command would run under the syntax-check allow rule. Check syntax with `bash -n FILE` only; ' +
                        'run a script as itself so the permission rules see it.'
                );
            }
        }
        const c = args.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
        // The script is the first non-option word after -c (`sh -c -- 'cmd'`, `sh -c -x 'cmd'`).
        const script = c === -1 ? undefined : args.slice(c + 1).find((a) => !a.startsWith('-'));
        if (script !== undefined) return checkCommand(script, nested());
        // `bash -n file` only parses the file; any other shell invocation runs it.
        const syntaxOnly = args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a));
        // No script operand: the shell reads its program from stdin.
        if (!syntaxOnly && !args.some((a) => !a.startsWith('-'))) {
            const feeders = [];
            for (let p = pipedFrom; p; p = p.pipedFrom) feeders.push(p);
            const download = feeders.find((f) => NET_CLIENTS.has(basename(f[0] ?? '')));
            if (download !== undefined) {
                return block(`Blocked: piping \`${basename(download[0])}\` into \`${cmd}\` runs downloaded code that nobody reviewed.`);
            }
            // A heredoc or here-string fed to a shell is a script it runs.
            // The same holds for text piped in (`cat <<'EOF' | bash`).
            // A literal `echo`/`printf` payload piped in is a script too.
            for (const text of [heredocBody, hereString, ...feeders.flatMap((f) => [f.heredocBody, f.hereString, literalPayload(f)])]) {
                if (text === undefined) continue;
                const r = checkCommand(text, nested());
                if (r) return r;
            }
        }
        return null;
    }
    if (cmd === 'eval') return checkCommand(args.join(' '), nested());
    if (cmd === 'systemd-run' || cmd === 'flatpak-spawn') {
        // They run a command outside this shell's state: look through to it.
        const at = args.findIndex((a) => ANALYSED.has(basename(a)) || PRIVILEGE.has(basename(a)));
        return at === -1 ? null : checkSegment(args.slice(at), Object.create(state));
    }
    return null;
}

/** Analyse a command line. Returns null if allowed, else { blocked, reason }. */
export function checkCommand(command, state = {}) {
    for (const sub of extractSubstitutions(command)) {
        const r = checkCommand(sub, state);
        if (r) return r;
    }
    for (const words of tokenize(command)) {
        const r = checkSegment(words, state);
        if (r) return r;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function main(check = checkCommand) {
    // Claude Code blocks only on exit 2; any other failure (an uncaught
    // exception exits 1) lets the command run. So nothing may escape this function.
    try {
        let payload;
        try {
            payload = JSON.parse(readFileSync(0, 'utf8'));
        } catch {
            process.stderr.write('guard-bash: could not parse hook input as JSON; blocking (fail closed).\n');
            process.exit(2);
        }
        if (payload?.tool_name && payload.tool_name !== 'Bash') process.exit(0);
        const command = payload?.tool_input?.command;
        if (typeof command !== 'string' || !command.trim()) process.exit(0);

        const result = check(command, typeof payload?.cwd === 'string' ? { cwd: payload.cwd } : {});
        if (result) {
            process.stderr.write(`guard-bash: ${result.reason}\n`);
            process.exit(2);
        }
    } catch (err) {
        process.stderr.write(`guard-bash: internal error (${err?.message ?? err}); blocking (fail closed).\n`);
        process.exit(2);
    }
    process.exit(0);
}

/** True when this file is the program being run (also through a symlink); never fails open. */
function isMain() {
    const arg = process.argv[1];
    if (!arg) return false;
    const self = fileURLToPath(import.meta.url);
    if (resolve(arg) === self) return true;
    try {
        return realpathSync(arg) === self;
    } catch {
        // Cannot tell: assume we are the hook if the file is named like it.
        return basename(arg) === 'guard-bash.mjs';
    }
}

if (isMain()) main();
