#!/usr/bin/env node
// PreToolUse hook for Claude Code's Bash tool (wired up in .claude/settings.json).
//
// Threat model: this hook stops an agent that is following instructions from
// carelessly or accidentally (a) writing to the wrong GitHub repository,
// (b) pushing somewhere it should not, (c) installing things on the developer's
// machine, or (d) deleting Ultima VII game data and savegames. It is NOT a
// sandbox against deliberate obfuscation (eval of built strings, shell
// variables, scripts written to disk and executed, aliases, ...). The real
// boundaries are token scope, the Hive GitHub App's repository access, the
// master branch ruleset (docs/branch-protection.md) and review of the changes (docs/risk-tiers.md,
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
//     Danathar/exult via an explicit --repo/-R (GH_REPO never counts: it can be
//     skipped by conditional flow or unset; one naming another repo blocks) (this includes
//     `gh pr create` and `gh issue create` without --repo); a write whose
//     arguments name a github.com URL of another repository.
//   - gh pr merge (Hive merges; agents never do), `gh issue transfer`, `gh repo`
//     writes, and `gh secret|variable|ruleset` writes (owner administration).
//   - gh api with a mutating method (or -f/-F/--input body) against anything
//     outside repos/Danathar/exult; GraphQL mutations.
//   - gh pr create without an explicit `--base master` and `--head <branch>`.
//   - git push with force, --mirror, --delete, a remote other than `origin`, a
//     URL remote, no explicit remote, or master as the destination (`master`,
//     `heads/master`, `refs/heads/master`).
//   - git remote add (the only remote is `origin`, and there is no upstream
//     remote), and anything that removes or re-points `origin`.
//   - git config / git remote changes that re-point `origin` or push URLs.
//   - git clean with -x/-X or an -e/--exclude pattern starting with `!` (it
//     would delete the ignored `gamedat` directory).
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
//   - sudo / doas / pkexec / run0 / su / runuser in any position of a wrapper
//     chain, including behind systemd-run, flatpak-spawn and `find -exec`.
//   - `make install`, `uninstall`, `install-*` goals (also gmake, `cmake
//     --install`, cmake install targets and `cmake -P cmake_install.cmake`,
//     `ninja install`, `meson install`), whatever DESTDIR says:
//     Exult's install hooks (update-mime-database, ...) also act on the host.
//   - package managers that change the system: apt, dnf, yum, zypper, pacman,
//     rpm-ostree, apk, brew, snap, flatpak, dpkg, rpm and similar, with an
//     install/remove/upgrade style subcommand or option (abbreviations such as
//     `dnf in`, `zypper up`, `rpm -ivh`, `dpkg -r`), and installers that install
//     with no subcommand (yay, paru, emerge, xbps-install); `npm|pnpm install -g`
//     (also --location=global), `yarn global`, `cargo [+toolchain] install`,
//     `pip install --user|--break-system-packages`.
//   - piping a download into a shell (`curl ... | bash`, also `bash -s ARGS`
//     and `bash -euo pipefail`), `bash -c "$(curl ...)"`, `eval "$(curl ...)"`,
//     `$(curl ...)` as a command, and running or sourcing a process
//     substitution (`bash <(curl ...)`, `source <(curl ...)`).
//   Game data
//   - rm, rmdir, unlink, shred, mv and `find -delete|-exec` naming Ultima VII
//     game data, savegames or the user's Exult configuration (gamedat/,
//     the repository-root static/, *.sav, savegame paths, ~/.exult,
//     ~/.config/exult, ~/.local/share/exult, ultima7 / serpent isle / black
//     gate / forge of virtue directories, /usr/share/**/exult), also through a
//     glob that can match them (`gam*`, `mv ./* /tmp`), and a recursive rm of
//     /, ~, $HOME, the current directory or its parents (`*`, `./*`, `../..`,
//     `~/.*`).
//
// Parsing notes: redirections (`>log`, `2>&1`, `&>f`, `<file`) end the word and
// are not arguments. Quoted heredoc bodies are data. Wrappers (env, timeout,
// xargs, time, flock, watch, taskset, chrt, unshare, nsenter, setpriv, chroot,
// busybox, exec -a, ...) are looked through to the command they run, not to a
// later argument; so are `find -exec|-execdir|-ok|-okdir CMD ... ;`, the body
// after `function NAME` and the command after `coproc`. Behind any other
// program (`setarch x86_64`, `prlimit`, `strace -o log`, `script -qc '...'`),
// each later word naming a command this hook checks, and each command string a
// word carries, is checked as though it stood alone. Deliberate obfuscation
// (variables, built strings, scripts written then run, abbreviated long
// options) stays out of scope. Read-only gh commands (view, list, status,
// diff, checks, api GET, ...) are always allowed. The command is split into
// segments on && || ; | & newlines, subshells and command substitutions;
// shell -c, eval, watch and `flock FILE -c` strings are analysed recursively.
// Quoted text is data, so a quoted "sudo" inside an `echo` or a read-only
// command is fine. A command name is read the way the shell builds it:
// `$'...'` escapes and `$"..."` are decoded (`$'\x67it'` is git), a brace group
// that can expand to a checked command is refused (`{git,} diff ...`), a glob
// is checked as each checked command it can match (`/usr/bin/g?t diff ...` and
// `g?t diff ...` as `git diff ...`), also behind any other program, and a
// command word that is only `*` wildcards (`*`, `./*`) is refused.

import { basename, resolve } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
const KEYWORDS = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'do', 'while', 'until']);
// Wrappers that run another command; we look through them for gh/git/shells.
// `time` is here rather than in KEYWORDS: the keyword takes `-p` and `--`, and
// /usr/bin/time takes options too, so its own options must be skipped.
const WRAPPERS = new Set([
    'env', 'command', 'builtin', 'exec', 'nohup', 'sudo', 'nice', 'xargs',
    'timeout', 'setsid', 'stdbuf', 'ionice', 'chronic', 'time',
    'flock', 'watch', 'taskset', 'chrt', 'unshare', 'nsenter', 'setpriv', 'chroot', 'busybox',
]);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'yash', 'posh', 'fish', 'csh', 'tcsh']);
// No list of programs that run a command is complete: `setarch x86_64 git
// push --force`, `prlimit` and `strace -o log` run the words after them, and
// `script -qc '...'` hands a shell one string. Behind any program this hook
// neither checks nor steps over, the checked command it would run is checked
// as a command of its own; see checkUnlistedProgram(). These print, match or
// look up their arguments and never run them, so they are not read at all,
// which keeps `grep -rn 'git push --force' docs` and `which sudo` working.
// Only the bare spelling counts, and leaving a program out can only over-refuse.
const ARGUMENT_ONLY_PROGRAMS = new Set(['echo', 'printf', 'grep', 'egrep', 'fgrep', 'which', 'whereis']);
// Each checked command behind such a program is checked from where it starts
// to the end of the segment, so the work grows with the square of the words.
// Past this many the command is refused unread; no real invocation runs that many.
const MAX_UNLISTED_INNER = 8;
// What separates the words of a command string a program hands to a shell:
// whitespace, the shell's own punctuation and quotes. Splitting on all of them
// reads more words than the shell would, which can only over-refuse.
const COMMAND_STRING_SEPARATORS = /[\s;&|()<>`'"]+/;
// How long one decision may take. Claude Code runs the command when the hook
// times out or dies, and reading every tail of a short-option cluster grows
// with the square of the word. A command still being read past this is
// refused instead; see spend().
export const BUDGET_MS = 5000;
let deadline = null;

/** Thrown once a decision has run past BUDGET_MS; main() refuses with it. */
class OverBudget extends Error {}

function spend() {
    if (deadline !== null && Date.now() > deadline) {
        throw new OverBudget(
            `Blocked: this hook could not finish checking the command within ${BUDGET_MS / 1000} seconds, and ` +
                'Claude Code runs a command whose hook times out, so it is refused rather than left half-read. ' +
                'Split it into shorter commands.'
        );
    }
}

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
            // command line carries on after the closing backtick. The text stays
            // in the word, as inside double quotes, so a `bash -c` / `eval` string
            // built from a substitution can be checked for what it runs.
            const end = input.indexOf('`', i + 1);
            const stop = end === -1 ? input.length : end + 1;
            append(input.slice(i, stop));
            i = stop;
        } else if (c === '$' && input[i + 1] === "'") {
            // ANSI-C quoting: the shell decodes the escapes and runs what they
            // spell, so `$'git'` and `$'\x67it'` are both git.
            const { text, next } = readAnsiC(input, i + 2);
            append(text);
            i = next;
        } else if (c === '$' && input[i + 1] === '"') {
            // Locale quoting: `$"git"` is the double-quoted string "git".
            i++;
        } else if (c === '$' && input[i + 1] === '(') {
            const end = closeParen(input, i + 2);
            append(input.slice(i, end));
            i = end;
        } else {
            append(c);
            i++;
        }
    }
    endSegment();
    return segments;
}

// What each one-letter escape in `$'...'` stands for; see readAnsiC().
const ANSI_C_ESCAPES = {
    a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v',
    '\\': '\\', "'": "'", '"': '"', '?': '?',
};

/**
 * Decode the body of an ANSI-C quoted string `$'...'` that starts at `i` (just
 * past the opening quote), as bash does: one-letter escapes, `\NNN` octal,
 * `\xHH`, `\uHHHH`, `\UHHHHHHHH` and `\cX`. Bash ends the string at a NUL. An
 * escape it does not know keeps its backslash. Returns { text, next } (next =
 * index after the closing quote).
 */
function readAnsiC(input, i) {
    let text = '';
    let ended = false;
    while (i < input.length && input[i] !== "'") {
        let ch = input[i++];
        if (ch === '\\' && i < input.length) {
            const e = input[i++];
            const digits = (re) => {
                const m = re.exec(input.slice(i));
                if (m) i += m[0].length;
                return m?.[0];
            };
            let hex;
            if (e in ANSI_C_ESCAPES) ch = ANSI_C_ESCAPES[e];
            else if (/[0-7]/.test(e)) ch = String.fromCharCode(parseInt(e + (digits(/^[0-7]{1,2}/) ?? ''), 8) & 0xff);
            else if (e === 'x' && (hex = digits(/^[0-9a-fA-F]{1,2}/))) ch = String.fromCharCode(parseInt(hex, 16));
            else if (e === 'u' && (hex = digits(/^[0-9a-fA-F]{1,4}/))) ch = String.fromCodePoint(parseInt(hex, 16));
            else if (e === 'U' && (hex = digits(/^[0-9a-fA-F]{1,8}/))) ch = String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff));
            else if (e === 'c' && i < input.length) ch = String.fromCharCode(input.charCodeAt(i++) & 0x1f);
            else ch = `\\${e}`;
        }
        if (ch === '\0') ended = true;
        if (!ended) text += ch;
    }
    return { text, next: i + 1 };
}

/**
 * Find the bodies of $(...) and `...` substitutions, including ones inside
 * double quotes (but not single quotes), so they can be analysed as commands.
 */
export function extractSubstitutions(input) {
    const found = [];
    let inSingle = false;
    let inDouble = false;
    // In `$'...'` a backslash escapes the next character, `\'` included, so
    // `$'it\'s' $(cmd)` ends its quote before the substitution.
    let ansiC = false;
    let escaped = -1; // index of the last character a backslash escaped
    const pending = []; // heredocs started on the current line
    for (let i = 0; i < input.length; i++) {
        const c = input[i];
        if (c === '\\' && (!inSingle || ansiC)) {
            escaped = ++i;
        } else if (c === "'" && !inDouble) {
            ansiC = !inSingle && input[i - 1] === '$' && escaped !== i - 1;
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
    if (m && m[1].toLowerCase() === REPO) {
        const rest = endpoint.slice(`repos/${m[1]}`.length).replace(/^\/+/, '').split(/[?#]/)[0];
        const risky = /^(?:pulls\/\d+\/merge|merges|git\/refs\/heads\/master|contents(?:\/|$)|branches(?:\/|$)|rulesets|actions\/(?:secrets|variables)|collaborators|hooks|keys|transfer)/;
        if (rest === '' || risky.test(rest)) {
            return block(
                `Blocked: mutating \`gh api\` call to "${endpoint}": repository settings, merges, master, contents, branches, rulesets, secrets, hooks and keys are the owner's.`
            );
        }
        return null;
    }

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
    if (envRepo !== null && !isTarget(envRepo)) {
        return block(`Blocked: GH_REPO is "${envRepo}", not Danathar/exult.`);
    }
    // GH_REPO never satisfies the requirement: `false && export GH_REPO=...; gh ...`
    // and a later `unset GH_REPO` leave it unset at run time. Only --repo/-R counts.
    const target = flagRepo;

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
    // The destination of a transfer is a positional OWNER/REPO (`gh issue transfer 5
    // exult/exult -R Danathar/exult`), which --repo does not cover; agents never move issues.
    if (group === 'issue' && action === 'transfer') {
        return block('Blocked: `gh issue transfer` moves an issue to another repository; agents never transfer issues.');
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
        return block(`Blocked: \`gh ${group} ${action}\` has no --repo/-R (GH_REPO does not count); gh would resolve the repository from git remotes or its default.`);
    }
    if (!isTarget(target)) {
        return block(`Blocked: \`gh ${group} ${action}\` targets "${target}", not Danathar/exult.`);
    }
    if (group === 'pr' && (action === 'create' || action === 'new')) return checkPrCreate(args);
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

function checkGit(args, inlineEnv = {}, exported = {}, cwd = undefined) {
    let redirected = false;
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
        if (a === '-C') cwd = cwd === null ? null : resolve(cwd ?? process.cwd(), args[i + 1] ?? '.');
        if (a === '--git-dir' || a === '--work-tree' || a.startsWith('--git-dir=') || a.startsWith('--work-tree=')) redirected = true;
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
    if (sub === 'push') {
        if (redirected) return block('Blocked: `git push` with --git-dir/--work-tree; the repository being pushed cannot be verified.');
        return checkGitPush(rest, cwd);
    }
    if (sub === 'remote') return checkGitRemote(rest);
    if (sub === 'clean' && rest.some((a) => /^-[a-zA-Z]*[xX]/.test(a))) {
        return block('Blocked: `git clean -x/-X` deletes ignored files, including a gitignored `gamedat` directory with saves.');
    }
    if (sub === 'clean' && cleanExcludes(rest).some((p) => p.startsWith('!'))) {
        return block('Blocked: `git clean -e \'!pattern\'` un-ignores files for this run, so it deletes ignored ones such as a `gamedat` directory with saves.');
    }
    if (sub === 'config') return checkGitConfig(rest);
    return null;
}

/**
 * The -e/--exclude patterns of `git clean` arguments, in every spelling: `-e PAT`,
 * `-ePAT`, bundled `-fde PAT` / `-fdePAT`, `--exclude PAT`, `--exclude=PAT` and
 * the abbreviations git accepts (`--excl=PAT`).
 */
function cleanExcludes(rest) {
    const found = [];
    for (let k = 0; k < rest.length; k++) {
        const a = rest[k];
        if (a === '--') break; // pathspecs follow
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            const name = a.slice(2, eq === -1 ? undefined : eq);
            if (name.length && 'exclude'.startsWith(name)) found.push(eq === -1 ? (rest[++k] ?? '') : a.slice(eq + 1));
        } else if (a.startsWith('-')) {
            const e = a.indexOf('e');
            if (e !== -1) found.push(e + 1 < a.length ? a.slice(e + 1) : (rest[++k] ?? ''));
        }
    }
    return found;
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
    ['--all', 'pushing every branch, master included'], ['--branches', 'pushing every branch, master included'],
    ['--prune', 'deleting remote refs (--prune)'], ['--repo', '`git push --repo` redirects the push; name the remote `origin` instead'],
];

/** Name of the checked-out branch in `cwd`, or null (detached HEAD, not a repository). */
function currentBranch(cwd) {
    const r = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: cwd ?? process.cwd(), encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
}

function checkGitPush(rest, cwd) {
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
    // `origin` must really be Danathar/exult in the repository the push runs in
    // (`cd /elsewhere && git push origin x`, `git -C /elsewhere push origin x`).
    if (cwd === null) {
        return block('Blocked: `git push` after a `cd` this hook cannot resolve; the repository being pushed cannot be verified.');
    }
    const url = spawnSync('git', ['remote', 'get-url', '--push', 'origin'], { cwd: cwd ?? process.cwd(), encoding: 'utf8' });
    if (url.status !== 0 || !isTarget(url.stdout.trim())) {
        return block('Blocked: `origin` of the repository this push runs in is not https://github.com/Danathar/exult.');
    }
    if (refspecs.some((r) => r.startsWith('+'))) {
        return block('Blocked: force push via "+" refspec.');
    }
    // git resolves a destination that is a trailing part of `refs/heads/master`
    // (`master`, `heads/master`, `refs/heads/master`) to the master branch.
    const toMaster = (r) => /^(?:(?:refs\/)?heads\/)?master$/.test(r.includes(':') ? r.slice(r.lastIndexOf(':') + 1) : r);
    if (refspecs.some(toMaster)) {
        return block('Blocked: pushing to master. Push a branch and open a PR; Hive merges.');
    }
    if (refspecs.some((r) => r.startsWith(':'))) {
        return block('Blocked: `git push origin :ref` deletes a remote ref.');
    }
    if (refspecs.some((r) => r.includes('*'))) {
        return block('Blocked: a wildcard refspec can reach master; name the branch.');
    }
    // No refspec, or HEAD / @ as the source: git pushes the current branch to its own name.
    if (refspecs.length === 0 || refspecs.some((r) => r === 'HEAD' || r === '@')) {
        if (currentBranch(cwd) === 'master') {
            return block('Blocked: the checked-out branch is master, so this push would update master. Switch to a branch and open a PR.');
        }
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

const PRIVILEGE = new Set(['sudo', 'doas', 'pkexec', 'run0', 'su', 'runuser']);
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

/**
 * The texts a literal `echo`/`printf` writes, to be analysed one by one ([] for
 * any other command). printf writes its format string too: in the common
 * one-operand form (`printf 'sudo id' | bash`) it is the whole payload. Its
 * backslash escapes \n, \t and \\ are expanded so `printf 'make install\n'`
 * reads as a command line; `%` directives are not emulated, the remaining
 * operands are analysed on their own instead.
 */
function literalPayloads(f) {
    const name = basename(f[0] ?? '');
    if (name !== 'echo' && name !== 'printf') return [];
    const rest = f.slice(1).filter((a) => !a.startsWith('-'));
    if (name === 'echo') return [rest.join(' ')];
    const [format = '', ...operands] = rest;
    const escapes = { n: '\n', t: '\t', '\\': '\\' };
    return [format.replace(/\\([nt\\])/g, (_, e) => escapes[e]), operands.join(' ')];
}

/** True if a command line has a $(...) or `...` substitution that runs a download client (curl, wget, ...). */
function substitutesDownload(text) {
    return extractSubstitutions(text).some(
        (body) =>
            tokenize(body).some((seg) => NET_CLIENTS.has(basename(seg.find((x) => !isAssignment(x)) ?? ''))) ||
            substitutesDownload(body)
    );
}

/**
 * Where a shell invocation (without -c) gets its program: { stdin, operand }.
 * `operand` is the script-file word, if any. The shell reads stdin with -s
 * (`curl URL | bash -s stable`) or when no operand is left once options and
 * their values (-o NAME, +O NAME, --rcfile FILE) are skipped (`bash -euo pipefail`).
 */
function shellInput(args) {
    let stdin = false;
    for (let k = 0; k < args.length; k++) {
        const a = args[k];
        if (a === '--' || a === '-') {
            const next = args[k + 1];
            return stdin || next === undefined ? { stdin: true, operand: undefined } : { stdin: false, operand: next };
        }
        if (a === '--rcfile' || a === '--init-file') {
            k++;
            continue;
        }
        if (a.startsWith('--')) continue;
        if (/^[-+][a-zA-Z]+$/.test(a)) {
            if (a[0] === '-' && a.includes('s')) stdin = true;
            if (/[oO]/.test(a)) k++; // -o NAME / +O NAME: the option name is the next word
            continue;
        }
        return stdin ? { stdin: true, operand: undefined } : { stdin: false, operand: a };
    }
    return { stdin: true, operand: undefined };
}

const INSTALL_GOAL = /^(?:install|uninstall|install-[\w-]+|uninstall-[\w-]+)$/;

/** Targets of `cmake --build`: `--target A B`, `-t A`, `--target=A`, up to the next option. */
function cmakeTargets(args) {
    const targets = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith('--target=')) targets.push(a.slice(9));
        else if (a !== '--target' && a !== '-t') continue;
        while (i + 1 < args.length && !args[i + 1].startsWith('-')) targets.push(args[++i]);
    }
    return targets;
}

/** `make install` and friends write to the host; there is no exception. */
function checkInstall(cmd, args) {
    let installing = false;
    if (MAKERS.has(cmd) || cmd === 'ninja') installing = args.some((a) => INSTALL_GOAL.test(a));
    else if (cmd === 'meson') installing = args.includes('install');
    else if (cmd === 'cmake') {
        installing = args.some((a) => a === '--install' || a.startsWith('--install=')) ||
            cmakeTargets(args).some((t) => /^(?:install|uninstall)(?:\/|$)/.test(t)) ||
            // `cmake -P build/cmake_install.cmake` runs the install script directly.
            args.some((a, i) => a === '-P' && /install/i.test(basename(args[i + 1] ?? '')));
    } else if (cmd === 'checkinstall') installing = true;
    if (!installing) return null;
    return block(
        `Blocked: \`${cmd} ... install\` writes to the host (/usr/local by default) and runs install hooks such as update-mime-database. ` +
            'Build in the tree and run from there; ask the owner to install.'
    );
}

const PKG_MANAGERS = new Set([
    'apt', 'apt-get', 'aptitude', 'dnf', 'dnf5', 'yum', 'zypper', 'pacman', 'yay', 'paru', 'rpm-ostree', 'apk', 'brew', 'snap',
    'flatpak', 'dpkg', 'rpm', 'port', 'pkg', 'nix-env', 'emerge', 'xbps-install', 'xbps-remove', 'transactional-update',
]);
// Subcommands (with the abbreviations dnf, zypper and friends accept) and options that change the system.
const PKG_MUTATING = new RegExp(
    '^(?:' +
        [
            'install', 'in', 'reinstall', 'localinstall', 'groupinstall', 'groupupdate', 'groupremove', 'builddep', 'build-dep',
            'source-install', 'si', 'install-new-recommends', 'inr', 'remove', 'rm', 'uninstall', 'erase', 'purge', 'upgrade',
            'up', 'update', 'dist-upgrade', 'dup', 'full-upgrade', 'distro-sync', 'distrosync', 'dsync', 'upgrade-minimal',
            'update-minimal', 'autoremove', 'downgrade', 'swap', 'add', 'del', 'delete', 'override', 'reset', 'rebase', 'deploy',
            'usroverlay', 'initramfs', 'kargs', 'refresh', 'ref',
            '-S\\w*', '-R\\w*', '-U\\w*', '-i', '-e', '--install', '--erase', '--upgrade', '--remove', '--sync',
        ].join('|') +
        ')$'
);
// Package managers driven by options rather than a subcommand.
const RPM_MUTATING_LONG = /^--(?:install|upgrade|freshen|erase|reinstall|import|initdb|rebuilddb|setperms|setugids|restore)(?:=|$)/;
const DPKG_MUTATING = /^(?:-[a-zA-Z]*[irPA]|--(?:install|unpack|configure|triggers-only|remove|purge|record-avail|set-selections|clear-selections|update-avail|merge-avail|clear-avail|forget-old-unavail|add-architecture|remove-architecture)(?:=|$))/;
const NIX_ENV_MUTATING = /^(?:-[ieu]|--(?:install|uninstall|upgrade|set|set-flag|rollback|switch-generation|switch-profile|delete-generations)(?:=|$))/;

/** True if a package manager's options select an install/remove/upgrade operation. */
function pkgOptionsMutate(cmd, args) {
    if (cmd === 'rpm') {
        // -i/-U/-F/-e install, upgrade, freshen or erase, unless the cluster is a query/verify (`rpm -qi x`).
        const query = args.some((a) => /^-[a-zA-Z]*[qVK]/.test(a) || ['--query', '--verify', '--checksig'].includes(a));
        return args.some((a) => RPM_MUTATING_LONG.test(a)) || (!query && args.some((a) => /^-[a-zA-Z]*[iUFe]/.test(a)));
    }
    if (cmd === 'dpkg') return args.some((a) => DPKG_MUTATING.test(a));
    if (cmd === 'nix-env') return args.some((a) => NIX_ENV_MUTATING.test(a));
    // pacman -D / --database edits the package database.
    if (['pacman', 'yay', 'paru'].includes(cmd) && args.some((a) => /^(?:-D\w*|--database)$/.test(a))) return true;
    // Without an operation these install or upgrade (`yay x`, `paru`, `emerge x`, `xbps-install x`).
    if (cmd === 'yay' || cmd === 'paru') {
        return !args.some((a) => /^-[QGPVh]/.test(a) || ['--query', '--getpkgbuild', '--show', '--version', '--help'].includes(a));
    }
    if (cmd === 'emerge') {
        return !args.some((a) => /^-[a-zA-Z]*[psSVh]/.test(a) || /^--(?:pretend|search|searchdesc|info|version|help)$/.test(a));
    }
    if (cmd === 'xbps-install' || cmd === 'xbps-remove') {
        return !args.some((a) => /^-[a-zA-Z]*[nhV]/.test(a) || ['--dry-run', '--help', '--version'].includes(a));
    }
    return false;
}

function checkPackages(cmd, args) {
    if (PKG_MANAGERS.has(cmd) && (args.some((a) => PKG_MUTATING.test(a)) || pkgOptionsMutate(cmd, args))) {
        return block(`Blocked: \`${cmd}\` with an install/remove/upgrade action changes the system's packages; ask the owner to install build dependencies.`);
    }
    // `npm --location global i x`: `global` is the option's value, not the subcommand.
    const sub = args.find((a, n) => !a.startsWith('-') && !a.startsWith('+') && args[n - 1] !== '--location');
    const global = args.some((a, n) => a === '-g' || a === '--global' || a === '--location=global' || (a === 'global' && args[n - 1] === '--location'));
    const npmWrites = ['install', 'i', 'in', 'ins', 'inst', 'insta', 'instal', 'isnt', 'isntall', 'add', 'uninstall', 'un', 'unlink', 'remove', 'rm', 'r', 'update', 'up', 'upgrade', 'link', 'ln'];
    if (['npm', 'pnpm'].includes(cmd) && global && npmWrites.includes(sub)) {
        return block(`Blocked: global \`${cmd}\` installs change the host; install into the project or a scratch directory.`);
    }
    if (cmd === 'yarn' && sub === 'global') return block('Blocked: `yarn global` changes the host.');
    // `cargo +nightly install x`: the +toolchain word is skipped above.
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
        '(?:^|/)savegames?(?:/|$)',
        '(?:^|/)\\.exult(?:\\.cfg)?(?:/|$)',
        '(?:^|/)\\.(?:config|local/share)/exult(?:/|$)',
        '/share/(?:games/)?exult(?:/|$)',
        '(?:^|/)(?:ultima[-_ ]?(?:7|vii)|serpent[-_ ]?isle|black[-_ ]?gate|forge[-_ ]?of[-_ ]?virtue)',
    ].join('|'),
    'i'
);
const HOME_WORDS = new Set(['~', '$HOME', '${HOME}']);

/** Path segments of an operand, normalised lexically: `//` and `.` dropped, `x/..` resolved. */
function pathSegments(operand) {
    const abs = operand.startsWith('/');
    const segs = [];
    for (const seg of operand.split('/')) {
        if (seg === '' || seg === '.') continue;
        if (seg === '..' && segs.length && segs.at(-1) !== '..' && !HOME_WORDS.has(segs.at(-1))) segs.pop();
        else if (!(seg === '..' && abs && !segs.length)) segs.push(seg); // `/..` is `/`
    }
    return { abs, segs };
}

/**
 * True for /, ~, $HOME, the current directory and its parents, and everything in
 * one of them (`rm -rf ./*`, `../*`, `../..`, `~/.*`, `/*`).
 */
function isRootTarget(operand) {
    const { segs } = pathSegments(operand);
    if (segs.length && /^\.?\*+$/.test(segs.at(-1))) segs.pop();
    const rest = segs.length && HOME_WORDS.has(segs[0]) ? segs.slice(1) : segs;
    return rest.every((s) => s === '..');
}

// Names a glob operand is tried against: game data at the top of the repository
// or in a named directory (gamedat, static, savegames, ~/.exult, ...).
const GAME_DATA_NAMES = [
    'gamedat', 'static', 'savegame', 'savegames', 'x.sav', '.exult', '.exult.cfg', 'exult', 'ultima7', 'serpentisle', 'blackgate',
    'forgeofvirtue',
];

/** Regular expression for one glob path segment (`*`, `?`, `[...]`); null if it cannot be built. */
function globSegment(seg) {
    let re = '';
    for (let i = 0; i < seg.length; i++) {
        const c = seg[i];
        const close = c === '[' ? seg.indexOf(']', i + 2) : -1;
        if (c === '*') re += '.*';
        else if (c === '?') re += '.';
        else if (close !== -1) {
            const body = seg.slice(i + 1, close);
            re += `[${body.replace(/^!/, '^').replace(/\\/g, '\\\\')}]`;
            i = close;
        } else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    try {
        return new RegExp(`^${re}$`);
    } catch {
        return null;
    }
}

/**
 * True if a glob operand could match game data (`rm -rf gam*`, `g?medat`, `mv ./* x`).
 * A bare `*` segment below a named directory (`build/*`) is not expanded: it only
 * reaches game data that the directory's own name would already show.
 */
function globHitsGameData(operand) {
    if (!/[*?[]/.test(operand)) return false;
    const { abs, segs } = pathSegments(operand);
    const top = segs.length === 1 && !abs;
    return GAME_DATA_NAMES.some((name) => {
        let changed = false;
        const path = segs.map((s) => {
            if (!/[*?[]/.test(s) || (!top && /^\*+$/.test(s))) return s;
            const re = globSegment(s);
            if (re !== null && !re.test(name)) return s;
            changed = true;
            return name; // a segment that cannot be parsed is assumed to match (fail closed)
        });
        return changed && GAME_DATA.test((abs ? '/' : '') + path.join('/'));
    });
}

function checkDelete(cmd, args) {
    const operands = args.filter((a) => !a.startsWith('-'));
    const recursive = args.some((a) => a === '--recursive' || /^-[a-zA-Z]*[rR]/.test(a));
    if (cmd === 'rm' && recursive && operands.some(isRootTarget)) {
        return block('Blocked: recursive `rm` of /, ~, $HOME, the current directory, .. or * would delete far more than this repository.');
    }
    if (cmd === 'find') {
        if (!args.some((a) => ['-delete', '-exec', '-execdir', '-ok', '-okdir'].includes(a))) return null;
    }
    const normal = (a) => {
        const { abs, segs } = pathSegments(a);
        return (abs ? '/' : '') + segs.join('/');
    };
    const hit = operands.find(
        (a) => GAME_DATA.test(normal(a)) || GAME_DATA.test(a.replace(/^\.\//, '')) || (cmd === 'find' && GAME_DATA.test(a)) || globHitsGameData(a)
    );
    if (hit !== undefined) {
        return block(
            `Blocked: \`${cmd} ${hit}\` would remove or move Ultima VII game data, a savegame or the user's Exult configuration. ` +
                'That data is copyrighted, not reproducible from this repository, and never the agent\'s to delete.'
        );
    }
    return null;
}

/**
 * `find ... -exec|-execdir|-ok|-okdir CMD ARGS ;` (or `{} +`) runs CMD for each
 * file: analyse each such command like a segment of its own.
 */
function checkFindExec(args, state) {
    for (let i = 0; i < args.length; i++) {
        if (!['-exec', '-execdir', '-ok', '-okdir'].includes(args[i])) continue;
        let end = i + 1;
        while (end < args.length && args[end] !== ';' && !(args[end] === '+' && args[end - 1] === '{}')) end++;
        const r = checkSegment(args.slice(i + 1, end), Object.create(state));
        if (r) return r;
        i = end;
    }
    return null;
}
const DELETERS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'mv', 'find']);

// Options of wrapper commands that take a separate value word. Only options
// with a required value belong here: listing a flag would skip the command word.
const WRAPPER_VALUE_OPTS = {
    timeout: ['-s', '--signal', '-k', '--kill-after'],
    nice: ['-n', '--adjustment'],
    xargs: ['-n', '-I', '-L', '-P', '-s', '-d', '-E', '-a', '--max-args', '--max-procs', '--max-chars', '--delimiter', '--arg-file', '--process-slot-var'],
    stdbuf: ['-i', '-o', '-e', '--input', '--output', '--error'],
    ionice: ['-c', '-n', '-p', '-P', '-u', '--class', '--classdata', '--pid', '--pgid', '--uid'],
    time: ['-f', '--format', '-o', '--output'],
    exec: ['-a'],
    flock: ['-w', '--timeout', '--wait', '-E', '--conflict-exit-code', '--start', '--length'],
    watch: ['-n', '--interval', '-q', '--equexit', '--eqexit', '-s', '--shotsdir'],
    chrt: ['-T', '--sched-runtime', '-P', '--sched-period', '-D', '--sched-deadline'],
    unshare: [
        '-S', '--setuid', '-G', '--setgid', '-R', '--root', '-w', '--wd', '-l', '--load-interp', '--owner', '--propagation',
        '--setgroups', '--monotonic', '--boottime', '--map-user', '--map-group', '--map-users', '--map-groups',
    ],
    // nsenter's -W/--wdns value is optional (`-W/path`, `--wdns=/path`), so the next word is never it.
    nsenter: ['-t', '--target', '-S', '--setuid', '-G', '--setgid', '-N', '--net-socket'],
    setpriv: [
        '--ambient-caps', '--inh-caps', '--bounding-set', '--ruid', '--euid', '--rgid', '--egid', '--reuid', '--regid',
        '--groups', '--securebits', '--pdeathsig', '--selinux-label', '--apparmor-profile', '--landlock-access',
        '--landlock-rule', '--seccomp-filter', '--ptracer',
    ],
    chroot: ['--userspec', '--groups'],
};
// Operand words a wrapper takes before the command: timeout's duration,
// taskset's CPU mask, flock's lock file, chroot's new root.
const WRAPPER_OPERANDS = { timeout: 1, taskset: 1, flock: 1, chroot: 1 };
// Options that make taskset/chrt act on a running process (-p) or only print
// (chrt -m): the words after them are not a command.
const NO_COMMAND_OPTS = {
    taskset: /^(?:--pid$|-[a-zA-Z]*p)/,
    chrt: /^(?:--pid$|--max$|-[a-zA-Z]*[pm])/,
};

// Each wrapper's options as getopt reads them: the short letters that take a
// value, the ones whose value is optional (only the rest of the same word,
// never the next word), and every long name (getopt_long accepts any
// unambiguous prefix). env has its own parser, envOptions().
const WRAPPER_GETOPT = {
    timeout: { value: 'sk', long: ['signal', 'kill-after', 'foreground', 'preserve-status', 'verbose'] },
    nice: { value: 'n', long: ['adjustment'] },
    stdbuf: { value: 'ioe', long: ['input', 'output', 'error'] },
    ionice: { value: 'cnpPu', long: ['class', 'classdata', 'pid', 'pgid', 'uid', 'ignore'] },
    xargs: { value: 'adEILnPs', optional: 'eil', long: ['arg-file', 'delimiter', 'eof', 'replace', 'max-lines', 'max-args', 'max-procs', 'max-chars', 'process-slot-var', 'null', 'open-tty', 'interactive', 'no-run-if-empty', 'verbose', 'exit', 'show-limits'] },
    time: { value: 'fo', long: ['format', 'output', 'append', 'verbose', 'portability', 'quiet'] },
    exec: { value: 'a', long: [] },
    flock: {
        value: 'wE',
        long: ['shared', 'exclusive', 'unlock', 'nonblocking', 'nb', 'timeout', 'wait', 'conflict-exit-code', 'close', 'no-fork', 'verbose', 'fcntl', 'start', 'length', 'help', 'version'],
    },
    watch: {
        value: 'nqs',
        optional: 'd',
        long: ['color', 'no-color', 'differences', 'help', 'interval', 'beep', 'errexit', 'follow', 'chgexit', 'equexit', 'exec', 'precise', 'no-rerun', 'shotsdir', 'no-title', 'no-wrap', 'version'],
    },
    chrt: {
        value: 'DPT',
        long: ['all-tasks', 'batch', 'deadline', 'ext', 'fifo', 'idle', 'pid', 'help', 'max', 'other', 'rr', 'sched-runtime', 'sched-period', 'sched-deadline', 'reset-on-fork', 'verbose', 'version'],
    },
    taskset: { value: '', long: ['all-tasks', 'pid', 'cpu-list', 'help', 'version'] },
    unshare: {
        value: 'RwSGl',
        long: [
            'help', 'version', 'mount', 'uts', 'ipc', 'net', 'pid', 'user', 'cgroup', 'time', 'fork', 'kill-child', 'forward-signals', 'mount-proc',
            'mount-binfmt', 'map-user', 'map-users', 'map-group', 'map-groups', 'map-root-user', 'map-current-user', 'map-auto', 'map-subids',
            'owner', 'propagation', 'setgroups', 'keep-caps', 'monotonic', 'boottime', 'load-interp', 'setuid', 'setgid', 'root', 'wd',
        ],
    },
    nsenter: {
        value: 'tNSG',
        optional: 'muinpCUTrwW',
        long: [
            'all', 'help', 'version', 'target', 'mount', 'uts', 'ipc', 'net', 'net-socket', 'pid', 'user', 'cgroup', 'time', 'setuid', 'setgid',
            'root', 'wd', 'wdns', 'env', 'no-fork', 'join-cgroup', 'preserve-credentials', 'keep-caps', 'user-parent', 'follow-context',
        ],
    },
    setpriv: {
        value: '',
        long: [
            'dump', 'nnp', 'no-new-privs', 'inh-caps', 'ambient-caps', 'list-caps', 'ruid', 'euid', 'rgid', 'egid', 'reuid', 'regid', 'clear-groups',
            'keep-groups', 'init-groups', 'groups', 'bounding-set', 'securebits', 'pdeathsig', 'ptracer', 'selinux-label', 'apparmor-profile',
            'landlock-access', 'landlock-rule', 'seccomp-filter', 'help', 'reset-env', 'version',
        ],
    },
    chroot: { value: '', long: ['groups', 'userspec', 'skip-chdir', 'help', 'version'] },
};

/**
 * Rewrite a wrapper's leading options into the one-option-per-word, full-name
 * form wrapperTarget() matches: `timeout -vk 5` -> `timeout -v -k 5`,
 * `nice --adj 5` -> `nice --adjustment 5`. Otherwise the value of a packed or
 * abbreviated option is taken for the command the wrapper runs.
 */
function expandWrapperOptions(cmd, w) {
    const spec = WRAPPER_GETOPT[cmd];
    if (!spec) return w;
    const takesValue = WRAPPER_VALUE_OPTS[cmd] ?? [];
    const out = [w[0]];
    let k = 1;
    for (; k < w.length; k++) {
        const a = w[k];
        if (a === '--' || a === '-' || !a.startsWith('-')) break;
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            const name = a.slice(2, eq === -1 ? undefined : eq);
            const hits = spec.long.filter((l) => l.startsWith(name));
            const full = `--${spec.long.includes(name) || hits.length !== 1 ? name : hits[0]}`;
            if (eq !== -1) out.push(full + a.slice(eq));
            else {
                out.push(full);
                if (takesValue.includes(full) && k + 1 < w.length) out.push(w[++k]);
            }
            continue;
        }
        for (let i = 1; i < a.length; i++) {
            // `xargs -iE cmd`: E is -i's replace string, not a packed -E.
            if (spec.optional?.includes(a[i])) {
                out.push(`-${a[i]}${a.slice(i + 1)}`);
                break;
            }
            if (!spec.value.includes(a[i])) {
                out.push(`-${a[i]}`);
            } else if (i + 1 < a.length) {
                out.push(`-${a[i]}${a.slice(i + 1)}`);
                break;
            } else {
                out.push(`-${a[i]}`);
                if (k + 1 < w.length) out.push(w[++k]);
            }
        }
    }
    return [...out, ...w.slice(k)];
}

// GNU env's long options; getopt accepts any unambiguous prefix (`--sp` is --split-string).
const ENV_LONG = [
    'ignore-environment', 'null', 'unset', 'chdir', 'argv0', 'split-string', 'block-signal', 'default-signal', 'ignore-signal',
    'list-signal-handling', 'debug', 'help', 'version',
];

/**
 * Parse env's own leading options and NAME=value words. Returns
 * { target, script, rest }: `target` is the index of the command env runs (-1 if
 * none), `script` the -S/--split-string command string (null if none) and `rest`
 * the index of the first word after it. Short options cluster (`-iS 'cmd'`,
 * `-iu NAME`), -u/-C/-S/-a take the rest of the word or the next word, and a lone
 * `-` is the obsolete spelling of -i. The wrapped command's own arguments
 * (`--title -Sx`) are never read as env options.
 */
function envOptions(w) {
    let options = true;
    for (let k = 1; k < w.length; k++) {
        const a = w[k];
        if (isAssignment(a)) continue;
        if (!options || !a.startsWith('-')) return { target: k, script: null, rest: k };
        if (a === '-') continue;
        if (a === '--') {
            options = false;
            continue;
        }
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            const name = a.slice(2, eq === -1 ? undefined : eq);
            const hits = ENV_LONG.filter((o) => o.startsWith(name));
            const opt = hits.includes(name) ? name : hits.length === 1 ? hits[0] : null;
            if (opt === 'split-string') {
                return eq === -1 ? { target: -1, script: w[k + 1] ?? '', rest: k + 2 } : { target: -1, script: a.slice(eq + 1), rest: k + 1 };
            }
            if ((opt === 'unset' || opt === 'chdir' || opt === 'argv0') && eq === -1) k++;
            continue;
        }
        for (let j = 1; j < a.length; j++) {
            if (a[j] === 'S') {
                return j + 1 < a.length
                    ? { target: -1, script: a.slice(j + 1), rest: k + 1 }
                    : { target: -1, script: w[k + 1] ?? '', rest: k + 2 };
            }
            if (a[j] === 'u' || a[j] === 'C' || a[j] === 'a') {
                if (j + 1 === a.length) k++; // the value is the next word
                break;
            }
        }
    }
    return { target: -1, script: null, rest: w.length };
}

// fish's long options (getopt accepts any unambiguous prefix) and the ones taking a value.
const FISH_LONG = [
    'command', 'debug', 'debug-output', 'debug-stack-frames', 'features', 'help', 'init-command', 'interactive', 'login',
    'no-config', 'no-execute', 'print-debug-categories', 'print-rusage-self', 'private', 'profile', 'profile-startup', 'version',
];
const FISH_LONG_VALUE = new Set(['command', 'init-command', 'debug', 'debug-output', 'debug-stack-frames', 'features', 'profile', 'profile-startup']);
// fish's short options taking a value: the rest of the word, or else the next word.
const FISH_SHORT_VALUE = 'cCdDfop';

/**
 * Every code string a fish invocation runs: the values of -c/--command and
 * -C/--init-command, attached (`-cCMD`, `--command=CMD`) or in the next word,
 * in a short cluster (`-ic CMD`) or behind an abbreviated long name (`--comm`).
 * Words that are not options are skipped rather than ending the scan, so an
 * option after a script name is still inspected.
 */
function fishScripts(args) {
    const scripts = [];
    for (let k = 0; k < args.length; k++) {
        const a = args[k];
        if (a === '--') break;
        if (!a.startsWith('-') || a === '-') continue;
        if (a.startsWith('--')) {
            const eq = a.indexOf('=');
            const name = a.slice(2, eq === -1 ? undefined : eq);
            const hits = FISH_LONG.filter((o) => o.startsWith(name));
            const opt = hits.includes(name) ? name : hits.length === 1 ? hits[0] : null;
            if (!FISH_LONG_VALUE.has(opt)) continue;
            const value = eq === -1 ? args[++k] : a.slice(eq + 1);
            if ((opt === 'command' || opt === 'init-command') && value !== undefined) scripts.push(value);
            continue;
        }
        for (let j = 1; j < a.length; j++) {
            if (!FISH_SHORT_VALUE.includes(a[j])) continue;
            const value = j + 1 < a.length ? a.slice(j + 1) : args[++k];
            if ((a[j] === 'c' || a[j] === 'C') && value !== undefined) scripts.push(value);
            break;
        }
    }
    return scripts;
}

/** Index of the command a wrapper (env, timeout, xargs, ...) runs, or -1 if there is none to analyse. */
function wrapperTarget(w) {
    const cmd = basename(w[0]);
    if (cmd === 'command' && w.some((a) => /^-[a-zA-Z]*[vV]/.test(a))) return -1; // lookup only
    if (cmd === 'env') return envOptions(w).target;
    const valueOpts = WRAPPER_VALUE_OPTS[cmd] ?? [];
    let operands = WRAPPER_OPERANDS[cmd] ?? 0;
    let priority = cmd === 'chrt'; // chrt's scheduling priority may be left out
    // After `--` every word is an operand or the command, even one starting with `-`
    // (`flock -- -lock CMD`: -lock is the lock file).
    let options = true;
    for (let k = 1; k < w.length; k++) {
        const a = w[k];
        // flock reads no options after its lock file: `flock FILE -c CMD` is its command form.
        if (cmd === 'flock' && operands === 0) return k;
        if (isAssignment(a)) continue;
        if (options && a === '--') {
            options = false;
            continue;
        }
        if (options && a.startsWith('-') && a.length > 1) {
            if (NO_COMMAND_OPTS[cmd]?.test(a)) return -1;
            if (valueOpts.includes(a)) k++;
            continue;
        }
        if (operands > 0) {
            operands--;
            continue;
        }
        // chrt reads the priority with strtol, so leading blanks and a sign are
        // part of it: `chrt -o +0 CMD` and `chrt -o -- -0 CMD` run CMD.
        if (priority && /^[ \t\n\v\f\r]*[+-]?\d+$/.test(a)) {
            priority = false;
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

/** Whether this word names a command checkSegment() checks or looks through. */
function namesCheckedCommand(a) {
    const name = basename(a);
    return ANALYSED.has(name) || PRIVILEGE.has(name) || ['find', 'watch', 'flock'].includes(name) || spelledNames(a).names.length > 0;
}

// A command name the shell builds before it looks it up (#257). Bash expands
// brace groups (`{git,}` is git, the empty alternative dropped; `{git,diff}` is
// `git diff`; `{f..h}it` holds git) and, in a word with a `/`, globs
// (`/usr/bin/g?t` is /usr/bin/git), so the word this hook reads is not the
// program that runs. A glob with no `/` matches files in the working directory,
// and an agent can create them (`touch git; g?t ...`); the name it expands to
// is then looked up on PATH, so `g?t` is read as git too. A last part that is
// only `*` matches whatever the directory holds, not one name, so it is not
// read as a checked command here; checkSegment() refuses it as a command word.
// A name built from a variable stays out of scope, as in the header.
const SPELLABLE = new Set([...ANALYSED, ...PRIVILEGE, ...WRAPPERS, 'find', 'watch', 'flock']);
const BRACE_GROUP = /\{([^{}]*,[^{}]*|[A-Za-z]\.\.[A-Za-z](?:\.\.-?\d+)?)\}/;
const GLOB = /[*?[]/;
// A word with more brace forms than this is read only as far as this many
// forms and with its braces and commas taken out; the forms grow with the
// product of the groups.
const MAX_BRACE_FORMS = 32;

/** The words one brace group stands for: its comma alternatives or its letter sequence. */
function braceAlternatives(body) {
    const seq = /^([A-Za-z])\.\.([A-Za-z])(?:\.\.(-?\d+))?$/.exec(body);
    if (!seq) return body.split(',');
    const [from, to] = [seq[1].charCodeAt(0), seq[2].charCodeAt(0)];
    const step = Math.abs(Number(seq[3] ?? 1)) || 1;
    const out = [];
    for (let k = Math.min(from, to); k <= Math.max(from, to) && out.length < MAX_BRACE_FORMS; k += step) {
        out.push(String.fromCharCode(k));
    }
    return out;
}

/** The word, the forms its brace groups expand to (at most MAX_BRACE_FORMS) and the word with braces and commas taken out. */
function braceForms(word) {
    const forms = [word, word.replace(/[{},]/g, '')];
    const pending = [word];
    while (pending.length && forms.length < MAX_BRACE_FORMS) {
        const form = pending.pop();
        const group = BRACE_GROUP.exec(form);
        if (!group) continue;
        for (const alt of braceAlternatives(group[1]).slice(0, MAX_BRACE_FORMS)) {
            const expanded = form.slice(0, group.index) + alt + form.slice(group.index + group[0].length);
            forms.push(expanded);
            pending.push(expanded);
        }
    }
    return forms;
}

/** A RegExp for a glob pattern of one path part: `*`, `?` and `[...]` (`[!...]`, `[^...]`); an unclosed `[` is literal. */
function globRegExp(pattern) {
    let src = '';
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        const close = c === '[' ? pattern.indexOf(']', i + 2) : -1;
        if (c === '*') src += '.*';
        else if (c === '?') src += '.';
        else if (close !== -1) {
            let set = pattern.slice(i + 1, close);
            if (set[0] === '!') set = `^${set.slice(1)}`;
            src += `[${set.replace(/[\\\]]/g, '\\$&')}]`;
            i = close;
        } else src += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    }
    try {
        return new RegExp(`^${src}$`);
    } catch {
        return /^/; // a class JavaScript cannot read: assume it matches anything
    }
}

/**
 * The commands this hook checks or looks through that the shell could run
 * from this command word once it expands it, and whether braces did it:
 * { braces, names }. `names` is empty for a word read as typed (`git`,
 * `./configure`, `{a,b}.txt`).
 */
function spelledNames(word) {
    const braces = BRACE_GROUP.test(word);
    if (!braces && !GLOB.test(word)) return { braces: false, names: [] };
    const names = new Set();
    for (const form of braces ? braceForms(word) : [word]) {
        if (/\s/.test(form)) continue; // a word with a space in it names no program
        const name = basename(form);
        if (name !== basename(word) && SPELLABLE.has(name)) names.add(name);
        else if (GLOB.test(name) && !/^\*+$/.test(name)) {
            const re = globRegExp(name);
            for (const n of SPELLABLE) if (re.test(n)) names.add(n);
        }
    }
    return { braces, names: [...names] };
}

/**
 * The word as the shell would look it up: quotes, backslashes and `$` removed.
 * A shell drops quotes and backslashes before it looks a name up, so `s""udo`,
 * `su\do` and `$'sudo'` inside a command string all run sudo. Removing more
 * can only refuse more.
 */
function unquoted(a) {
    return a.replace(/[$"'\\]/g, '');
}

/**
 * The command strings a word may hand to a shell: the word itself when it
 * holds more than one word of its own (`script -c 'git push --force'`), or a
 * value attached to an option in the same word: after the `=` of a long
 * option, or after any letter of a short-option cluster (`script -qc'sudo id'`).
 * Which letter takes a value is not modelled, so every one is tried. Yielded
 * one at a time: a long cluster has as many tails as letters, each nearly as
 * long as the word.
 */
function* commandStrings(word) {
    if (COMMAND_STRING_SEPARATORS.test(word)) yield word;
    if (word.startsWith('--')) {
        const eq = word.indexOf('=');
        if (eq !== -1) yield word.slice(eq + 1);
    } else {
        const cluster = /^-[A-Za-z0-9]+/.exec(word);
        if (cluster) for (let cut = 2; cut <= cluster[0].length; cut++) yield word.slice(cut);
    }
}

/**
 * For a segment whose command is a program this hook neither checks nor steps
 * over (`setarch x86_64 git push ...`, `prlimit ...`, `script -qc '...'`), the
 * refusal for the checked command it would run, or null. Each later word that
 * names a checked command is checked from there to the end, with the
 * assignments in front of the program, and each command string a later word
 * carries is checked as a command line of its own. A command that passes alone
 * still passes behind any program. Only over-refusing is guessed at: an option
 * value that reads as a checked command (`man sudo`) is refused too.
 */
function checkUnlistedProgram(w, inlineEnv, state) {
    const cmd = w[0];
    if (ARGUMENT_ONLY_PROGRAMS.has(cmd)) return null;
    const env = Object.entries(inlineEnv).map(([name, value]) => `${name}=${value}`);
    let checked = 0;
    for (let n = 1; n < w.length; n++) {
        spend();
        let refusal = null;
        if (namesCheckedCommand(w[n])) {
            if (++checked > MAX_UNLISTED_INNER) {
                return block(
                    `Blocked: more than ${MAX_UNLISTED_INNER} commands this hook checks behind \`${basename(cmd)}\`, ` +
                        'too many to read. Run them as commands of their own.'
                );
            }
            let start = n;
            while (start > 1 && isAssignment(w[start - 1])) start--;
            refusal = checkSegment([...env, ...w.slice(start)], state());
        }
        if (!refusal) {
            for (const text of commandStrings(w[n])) {
                spend();
                const names = (t) => t.split(COMMAND_STRING_SEPARATORS).some((piece) => piece && namesCheckedCommand(piece));
                // The words as the shell reads them too: `$'\x67it'` is git.
                const read = () => tokenize(text).some((seg) => seg.some(namesCheckedCommand));
                if (!names(text) && !names(unquoted(text)) && !read()) continue;
                refusal = checkCommand(text, state());
                if (refusal) break;
            }
        }
        if (refusal) {
            return {
                ...refusal,
                reason:
                    `Blocked: \`${basename(cmd)}\` runs a command that is refused on its own, and bypass and auto ` +
                    `modes prompt for neither, so it is checked as though it stood alone. ` +
                    refusal.reason.replace(/^Blocked: /, ''),
            };
        }
    }
    return null;
}

function checkSegment(words, state) {
    spend();
    const { pipedFrom, stdinFrom, hereString, heredocBody } = words;
    let w = words.slice();
    const inlineEnv = {};
    // Set once the segment runs through xargs: xargs appends words it reads at
    // run time, so no argument check below sees the real command line.
    let xargsFed = false;
    for (;;) {
        while (w.length && (isAssignment(w[0]) || KEYWORDS.has(w[0]) || w[0] === 'function' || w[0] === 'coproc')) {
            if (isAssignment(w[0])) {
                const eq = w[0].indexOf('=');
                inlineEnv[w[0].slice(0, eq)] = w[0].slice(eq + 1);
            }
            // `function NAME { CMD; }`: the body follows the name. `coproc NAME { CMD; }`
            // names a compound command; `coproc CMD` runs CMD.
            if (w[0] === 'function' || (w[0] === 'coproc' && w[2] === '{')) w.shift();
            w.shift();
        }
        if (!w.length) return null;
        // A command word the shell expands into a checked command (#257).
        // Braces are refused: `{git,diff} --no-index ...` is `git diff
        // --no-index ...`, and the words they add are not modelled. A glob in
        // a path is checked as each command it can match, then read on as
        // typed below, so `/usr/bin/g?t status` and `g?t status` pass as `git
        // status` does.
        const spelled = spelledNames(w[0]);
        if (spelled.braces && spelled.names.length) {
            return block(
                `Blocked: \`${w[0]}\` is a command name the shell expands with its braces before running it, and it can ` +
                    `expand to \`${spelled.names[0]}\`, which this hook checks only when the name is spelled out. Spell the name out.`
            );
        }
        for (const name of spelled.names) {
            const env = Object.entries(inlineEnv).map(([k, v]) => `${k}=${v}`);
            const respelled = Object.assign([...env, name, ...w.slice(1)], { pipedFrom, stdinFrom, hereString, heredocBody });
            const r = checkSegment(respelled, state);
            if (r) {
                return {
                    ...r,
                    reason: `Blocked: \`${w[0]}\` is a word the shell can expand to \`${name}\`, so it is checked as \`${name}\`. ${r.reason.replace(/^Blocked: /, '')}`,
                };
            }
        }
        // `*` or `./*` as the command word runs the first file the directory
        // holds, with the rest as its arguments, so it can be any program.
        if (/^\*+$/.test(basename(w[0]))) {
            return block(
                `Blocked: \`${w[0]}\` as a command name runs whichever file the shell matches first, so this hook ` +
                    'cannot tell which program it is. Spell the name out.'
            );
        }
        const cmd = basename(w[0]);
        if (PRIVILEGE.has(cmd)) {
            return block(`Blocked: \`${cmd}\` (privilege escalation) is never run by agents in this repository.`);
        }
        if (!WRAPPERS.has(cmd)) break;
        // `env -S 'gh pr create'` / `-iS ...` / `--split-string=...` runs a command string.
        if (cmd === 'env') {
            const { script, rest } = envOptions(w);
            if (script !== null) {
                // Check the string on its own, then as the head of the command
                // that still has the remaining words appended.
                const alone = checkCommand(script, state);
                if (alone) return alone;
                const head = tokenize(script).flat();
                return checkSegment([...head, ...w.slice(rest)], state);
            }
        }
        w = expandWrapperOptions(cmd, w);
        // Look through the wrapper to the command it runs: skip its own options
        // (and their values), NAME=value words, and operands such as timeout's duration.
        const idx = wrapperTarget(w);
        for (const x of w.slice(1, idx === -1 ? w.length : idx)) {
            if (isAssignment(x)) {
                const eq = x.indexOf('=');
                inlineEnv[x.slice(0, eq)] = x.slice(eq + 1);
            }
        }
        if (idx === -1) return null;
        // `watch CMD...` joins its words and runs them with `sh -c` (with -x it runs
        // them directly; the words are also looked through below, so both readings
        // are checked). `flock FILE -c CMD` runs CMD with `sh -c`.
        if (cmd === 'watch') {
            const r = checkCommand(w.slice(idx).join(' '), Object.create(state));
            if (r) return r;
        } else if (cmd === 'flock' && (w[idx] === '-c' || w[idx] === '--command')) {
            return checkCommand(w[idx + 1] ?? '', Object.create(state));
        }
        if (cmd === 'xargs') xargsFed = true;
        w = w.slice(idx);
    }

    // `$(curl URL)` as the command word runs whatever the download returns.
    if (substitutesDownload(w[0])) {
        return block('Blocked: running the output of a download (`$(curl ...)`) as a command runs code that nobody reviewed.');
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
            if (/^(GIT_CONFIG_|GIT_SSH)/i.test(name) || WATCHED_ENV.test(name)) {
                (state.exportedEnv ??= {})[name] = eq === -1 ? null : a.slice(eq + 1);
            }
        }
        return null;
    }
    if (cmd === 'cd' || cmd === 'pushd' || cmd === 'popd') {
        const target = args.find((a) => !a.startsWith('-'));
        const known = cmd !== 'popd' && target !== undefined && target !== '-' && state.cwd !== null && !/[$`~{*?[\\]/.test(target);
        state.cwd = known ? resolve(state.cwd ?? process.cwd(), target) : null;
        return null;
    }
    if (cmd === 'gh') {
        const envRepo = inlineEnv.GH_REPO ?? state.exportedGhRepo ?? null; // only used to refuse a foreign value
        return checkGh(args, envRepo);
    }
    if (cmd === 'git') return checkGit(args, inlineEnv, state.exportedEnv ?? {}, state.cwd);
    if (cmd === 'node' || cmd === 'nodejs') return checkNode(cmd, args, env);
    if (MAKERS.has(cmd) || ['ninja', 'meson', 'cmake', 'checkinstall'].includes(cmd)) return checkInstall(cmd, args);
    if (PKG_MANAGERS.has(cmd) || ['npm', 'pnpm', 'yarn', 'cargo', 'pip', 'pip3'].includes(cmd)) return checkPackages(cmd, args);
    if (DELETERS.has(cmd)) return checkDelete(cmd, args) ?? (cmd === 'find' ? checkFindExec(args, state) : null);
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
        // fish takes code from -c/--command and -C/--init-command (each may repeat,
        // with the value attached or in the next word); every one of them runs.
        if (cmd === 'fish') {
            const scripts = fishScripts(args);
            for (const s of scripts) {
                // `fish -c "$(curl URL)"` runs whatever the download returns.
                if (substitutesDownload(s)) {
                    return block(`Blocked: \`${cmd} -c "$(curl ...)"\` runs downloaded code that nobody reviewed.`);
                }
                const r = checkCommand(s, nested());
                if (r) return r;
            }
            if (scripts.length) return null;
        } else {
            const c = args.findIndex((a) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a));
            // The script is the first non-option word after -c (`sh -c -- 'cmd'`, `sh -c -x 'cmd'`).
            const script = c === -1 ? undefined : args.slice(c + 1).find((a) => !a.startsWith('-'));
            if (script !== undefined) {
                // `bash -c "$(curl URL)"` runs whatever the download returns.
                if (substitutesDownload(script)) {
                    return block(`Blocked: \`${cmd} -c "$(curl ...)"\` runs downloaded code that nobody reviewed.`);
                }
                return checkCommand(script, nested());
            }
        }
        // `bash -n file` only parses the file; any other shell invocation runs it.
        const syntaxOnly = args.some((a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a));
        const { stdin, operand } = shellInput(args);
        // `bash <(curl URL)`: the script is a process substitution this hook cannot read.
        if (!syntaxOnly && operand?.startsWith('/dev/fd/')) {
            return block(`Blocked: running a process substitution as a script (\`${cmd} <(curl ...)\`) runs code this hook cannot inspect.`);
        }
        // No script operand, or -s: the shell reads its program from stdin.
        if (!syntaxOnly && stdin) {
            const feeders = [];
            for (let p = pipedFrom; p; p = p.pipedFrom) feeders.push(p);
            const download = feeders.find((f) => NET_CLIENTS.has(basename(f[0] ?? '')));
            if (download !== undefined) {
                return block(`Blocked: piping \`${basename(download[0])}\` into \`${cmd}\` runs downloaded code that nobody reviewed.`);
            }
            // A heredoc or here-string fed to a shell is a script it runs.
            // The same holds for text piped in (`cat <<'EOF' | bash`).
            // A literal `echo`/`printf` payload piped in is a script too.
            for (const text of [heredocBody, hereString, ...feeders.flatMap((f) => [f.heredocBody, f.hereString, ...literalPayloads(f)])]) {
                if (text === undefined) continue;
                const r = checkCommand(text, nested());
                if (r) return r;
            }
        }
        return null;
    }
    if (cmd === 'eval') {
        if (substitutesDownload(args.join(' '))) {
            return block('Blocked: `eval "$(curl ...)"` runs downloaded code that nobody reviewed.');
        }
        return checkCommand(args.join(' '), nested());
    }
    if (cmd === 'systemd-run' || cmd === 'flatpak-spawn') {
        // They run a command outside this shell's state: look through to it.
        const at = args.findIndex((a) => ANALYSED.has(basename(a)) || PRIVILEGE.has(basename(a)));
        return at === -1 ? null : checkSegment(args.slice(at), Object.create(state));
    }
    return checkUnlistedProgram(w, inlineEnv, nested);
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

export function main(check = checkCommand, budgetMs = BUDGET_MS) {
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

        deadline = Date.now() + budgetMs;
        const result = check(command, typeof payload?.cwd === 'string' ? { cwd: payload.cwd } : {});
        if (result) {
            process.stderr.write(`guard-bash: ${result.reason}\n`);
            process.exit(2);
        }
    } catch (err) {
        if (err instanceof OverBudget) {
            process.stderr.write(`guard-bash: ${err.message}\n${GUIDANCE}\n`);
            process.exit(2);
        }
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
