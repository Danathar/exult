// docs/branch-protection.md says what protects `master`: the rules of the
// committed ruleset, the six checks it requires and the workflow each comes
// from. docs/multi-agent.md, AGENTS.md, CONTRIBUTING.md and policies/README.md
// repeat the check names, the count or the test entry points. Agents and the
// owner decide what is safe to merge from these pages, and nothing read them:
// the page said six workflows carry the required checks when four do. These
// tests hold the pages to .github/rulesets/master.json and .github/workflows/,
// so a rule or a required check changed in one has to be written into the other
// in the same change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../check-policies.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const PAGE = 'docs/branch-protection.md';
const RULESET = '.github/rulesets/master.json';
const WORKFLOWS = '.github/workflows';
const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

const ruleset = JSON.parse(read(RULESET));
const rule = (type) => ruleset.rules.find((r) => r.type === type);
const requiredNames = () => rule('required_status_checks').parameters.required_status_checks.map((c) => c.context).sort();
const codeSpans = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const flat = (text) => text.replace(/\s+/g, ' ');

// The text under a heading, up to the next heading of any level.
function section(page, heading) {
    const lines = read(page).split('\n');
    const start = lines.indexOf(heading);
    assert.notEqual(start, -1, `${page} has no ${JSON.stringify(heading)} heading`);
    const end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
    return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

const enforced = () => section(PAGE, '## What is enforced');

// The rows of the table whose header is `header`, as arrays of cells.
function table(text, header) {
    const lines = text.split('\n');
    const start = lines.indexOf(header);
    assert.notEqual(start, -1, `no table headed ${header}`);
    const rows = [];
    for (const line of lines.slice(start + 2)) {
        if (!line.startsWith('|')) break;
        rows.push(line.split('|').slice(1, -1).map((c) => c.trim()));
    }
    return rows;
}

function checkRows() {
    return table(enforced(), '| check | workflow |').map(([check, file]) => {
        const [name, ...moreNames] = codeSpans(check);
        const [source, ...moreSources] = codeSpans(file);
        assert.deepEqual([...moreNames, ...moreSources], [], `one check and one workflow per row: ${check} ${file}`);
        return { name, source };
    });
}

// What each `on:` event of a workflow sets, and each job's display name and
// job-level `if:`. Enough YAML for the files here: two-space indents, `on:` as a
// block, a list under a key one level in, `name:` and `if:` four spaces into a
// job, and a `${{ matrix.<key> }}` job name expanded over `matrix.include`.
function parseWorkflow(text) {
    const on = {};
    const jobs = [];
    let top = null;
    let event = null;
    let key = null;
    let job = null;
    const finish = () => {
        if (!job) return;
        const name = job.name ?? job.id;
        const matrixKey = /\$\{\{ *matrix\.([\w-]+) *\}\}/.exec(name)?.[1];
        const names = matrixKey ? (job.matrix[matrixKey] ?? []).map((v) => name.replace(/\$\{\{.*?\}\}/, v)) : [name];
        for (const n of names) jobs.push({ name: n, id: job.id, if: job.if, body: job.body });
    };
    for (const line of text.split('\n')) {
        let m;
        if ((m = /^(\S[^:]*):/.exec(line))) {
            top = m[1].replace(/^['"]|['"]$/g, '');
            continue;
        }
        if (top === 'on') {
            if ((m = /^ {2}([\w-]+):/.exec(line))) {
                event = m[1];
                on[event] = {};
            } else if ((m = /^ {4}([\w-]+): *(.*?) *$/.exec(line))) {
                key = m[1];
                on[event][key] = m[2] || [];
            } else if ((m = /^ {6}- *"?(.+?)"? *$/.exec(line))) {
                on[event][key].push(m[1]);
            }
        }
        if (top !== 'jobs') continue;
        if ((m = /^ {2}([\w-]+):\s*$/.exec(line))) {
            finish();
            job = { id: m[1], name: null, if: null, matrix: {}, body: '' };
            continue;
        }
        if (!job) continue;
        job.body += `${line}\n`;
        if ((m = /^ {4}name: *(.+?) *$/.exec(line))) job.name = m[1].replace(/^(['"])(.*)\1$/, '$2');
        else if ((m = /^ {4}if: *(.+?) *$/.exec(line))) job.if = m[1];
        else if ((m = /^ {10}(?:- )?([\w-]+): *(\S.*?) *$/.exec(line))) (job.matrix[m[1]] ??= []).push(m[2]);
    }
    finish();
    return { on, jobs };
}

const workflow = (file) => parseWorkflow(read(file));
const upstreamBuilds = () => fs.readdirSync(path.join(repoRoot, WORKFLOWS))
    .filter((f) => /^ci-.*\.yml$/.test(f))
    .map((f) => `${WORKFLOWS}/${f}`);

test('the reader expands the job names of ci.yml', () => {
    assert.deepEqual(
        workflow(`${WORKFLOWS}/ci.yml`).jobs.map((j) => j.name),
        ['Unit tests (gcc)', 'Unit tests (clang)', 'E2E (tools)', 'Out-of-tree build (read-only source)'],
    );
});

test('the table lists exactly the checks the ruleset requires', () => {
    assert.deepEqual(checkRows().map((r) => r.name).sort(), requiredNames());
});

test('every check in the table is a job of the workflow its row names', () => {
    for (const { name, source } of checkRows()) {
        const names = workflow(source).jobs.map((j) => j.name);
        assert.ok(names.includes(name), `${name} is not a job of ${source} (${names.join(', ')})`);
    }
});

test('the counts the pages state are the ruleset\'s', () => {
    const text = flat(enforced());
    const checks = COUNT_WORDS[requiredNames().length];
    const sources = COUNT_WORDS[new Set(checkRows().map((r) => r.source)).size];
    assert.ok(text.includes(`has ${COUNT_WORDS[ruleset.rules.length]} rules`), 'the number of rules');
    assert.ok(text.includes(`the ${checks} checks below must pass`), 'the number of required checks');
    assert.ok(text.includes(`All ${sources} workflows run on every pull request`), 'the number of workflows they come from');
    assert.ok(flat(read('policies/README.md')).includes(`pull request plus ${checks} required status checks`), 'policies/README.md');
});

test('the rule table names every rule of the ruleset and what it sets', () => {
    const rows = table(enforced(), '| rule | effect |');
    assert.deepEqual(rows.map(([name]) => codeSpans(name)[0]), ruleset.rules.map((r) => r.type));
    const effect = (type) => flat(rows.find(([name]) => name === `\`${type}\``)[1]);
    const review = rule('pull_request').parameters;
    assert.ok(effect('pull_request').includes(`\`required_approving_review_count: ${review.required_approving_review_count}\``));
    assert.equal(review.required_approving_review_count, 0, 'the page says no approving review is required');
    assert.ok(effect('pull_request').includes('code owner review is **not** required'));
    assert.equal(review.require_code_owner_review, false);
    const strict = rule('required_status_checks').parameters.strict_required_status_checks_policy;
    assert.ok(effect('required_status_checks').includes(`\`strict_required_status_checks_policy: ${strict}\``));
    assert.equal(strict, true, 'the page says the branch must be up to date');
});

test('the ruleset is the one the page describes', () => {
    const text = flat(read(PAGE));
    assert.ok(text.includes(`live ruleset \`${ruleset.name}\``), ruleset.name);
    assert.ok(text.includes(`lists \`${ruleset.name}\` as \`${ruleset.enforcement}\``), ruleset.enforcement);
    assert.equal(ruleset.enforcement, 'active');
    assert.equal(ruleset.target, 'branch');
    assert.deepEqual(ruleset.conditions.ref_name, { include: ['~DEFAULT_BRANCH'], exclude: [] }, 'the page says it targets the default branch');
    assert.ok(flat(enforced()).includes('`bypass_actors` is empty'));
    assert.deepEqual(ruleset.bypass_actors, []);
});

test('required checks run on every pull request and push to master, unfiltered', () => {
    assert.ok(flat(enforced()).includes('on every pull request and every push to `master` with no path filter'));
    for (const { name, source } of checkRows()) {
        const { on, jobs } = workflow(source);
        assert.deepEqual(on.pull_request, {}, `${source}: pull_request is filtered, so a required check may never start`);
        assert.deepEqual(on.push, { branches: on.push?.branches }, `${source}: push is filtered by more than its branch`);
        assert.equal(on.push.branches.replace(/[[\]\s]/g, ''), 'master', `${source}: push branches`);
        assert.equal(jobs.find((j) => j.name === name).if, null, `${name} has a job-level if:, so it can be skipped`);
    }
});

test('the upstream ci-*.yml builds are path-filtered and not required', () => {
    const builds = upstreamBuilds();
    assert.ok(builds.length > 0, 'no ci-*.yml workflows');
    const claims = [[flat(enforced()), ['`docs/**`', '`*.md`']], [flat(section('AGENTS.md', '## Tests')), ['`docs/**`', '`*.md`', '`README*`']]];
    for (const [text, globs] of claims) {
        assert.match(text, /`ci-\*\.yml`/);
        for (const glob of globs) assert.ok(text.includes(glob), `${glob} is not named`);
    }
    for (const file of builds) {
        const { on, jobs } = workflow(file);
        for (const event of ['push', 'pull_request']) {
            for (const glob of ['!docs/**', '!**.md', '!**README**']) {
                assert.ok(on[event]?.paths?.includes(glob), `${file}: ${event} does not skip ${glob}`);
            }
        }
        for (const job of jobs) assert.ok(!requiredNames().includes(job.name), `${job.name} of ${file} is required`);
    }
});

test('the live comparison on the page is the one the nightly run makes', () => {
    const text = section(PAGE, '## Checking it');
    const file = `${WORKFLOWS}/nightly-compliance.yml`;
    assert.ok(text.includes(`\`${file}\``));
    assert.ok(text.includes('`RULESET_READ_TOKEN`'));
    const nightly = read(file);
    assert.ok(nightly.includes('secrets.RULESET_READ_TOKEN'), `${file} does not read the secret`);
    assert.ok(nightly.includes(`file=${RULESET}`), `${file} compares another file`);
    const fields = /fields='(\{[^']+\})'/.exec(nightly)?.[1];
    assert.ok(fields, `${file} states no field list`);
    const onPage = [...text.matchAll(/\{name,[^}]+\}/g)].map((m) => m[0]);
    assert.equal(onPage.length, 2, 'the page compares the same fields on both sides');
    for (const list of onPage) assert.equal(list, fields);
    assert.ok(!fields.includes('bypass_actors'), 'the page says the comparison leaves bypass_actors out');
});

test('docs/multi-agent.md lists exactly the required checks', () => {
    const text = section('docs/multi-agent.md', '## Who decides what lands');
    const bullet = /^- \*\*Required checks\.\*\*[^]*?(?=^- )/m.exec(text)?.[0];
    assert.ok(bullet, 'no "Required checks." bullet');
    const spans = codeSpans(bullet);
    const workflowName = /^name: (.+)$/m.exec(read(`${WORKFLOWS}/ci.yml`))[1];
    assert.ok(flat(bullet).includes(`ruleset requires \`${workflowName}\` (`), 'the workflow name of ci.yml');
    const ciJobs = workflow(`${WORKFLOWS}/ci.yml`).jobs.map((j) => j.name);
    const inParens = codeSpans(/\(([^)]*\)[^)]*\)[^)]*)\)/.exec(flat(bullet))[1]);
    for (const job of inParens) assert.ok(ciJobs.includes(job), `${job} is not a job of ci.yml`);
    const named = spans.filter((s) => requiredNames().includes(s)).sort();
    assert.deepEqual(named, requiredNames());
    assert.ok(flat(bullet).includes('on a branch that is up to date with `master`'));
});

test('the paths docs/multi-agent.md says the owner merges are Tier 3', () => {
    const config = JSON.parse(read('risk-config.json'));
    const samples = new Map([
        ['.claude/settings.json', '.claude/settings.json'],
        ['.claude/hooks/**', '.claude/hooks/guard-bash.mjs'],
        ['policies/', 'policies/repo-target.json'],
        ['CODEOWNERS', '.github/CODEOWNERS'],
    ]);
    const text = section('docs/multi-agent.md', '## Who decides what lands');
    const bullet = /^- \*\*The permission boundary needs the owner\.\*\*[^]*?(?=^- )/m.exec(text)?.[0];
    assert.ok(bullet, 'no "permission boundary" bullet');
    assert.deepEqual(codeSpans(bullet), [...samples.keys()]);
    for (const [span, sample] of samples) assert.equal(classify(config, sample).tier, 3, span);
});

test('AGENTS.md names the required checks and where they run', () => {
    const text = flat(section('AGENTS.md', '## Tests'));
    const sentence = /CI \(`\.github\/workflows\/ci\.yml`\) runs them as the jobs (.*?) are separate workflows\./.exec(text)?.[1];
    assert.ok(sentence, 'no sentence naming the CI jobs');
    assert.deepEqual(codeSpans(sentence).sort(), requiredNames());
    const [unit, clang, e2e] = codeSpans(sentence);
    const ciJobs = workflow(`${WORKFLOWS}/ci.yml`).jobs.map((j) => j.name);
    for (const job of [unit, clang, e2e]) assert.ok(ciJobs.includes(job), `${job} is not a job of ci.yml`);
    for (const check of codeSpans(sentence).slice(3)) assert.ok(!ciJobs.includes(check), `${check} is in ci.yml`);
});

test('the test entry points the pages give exist and are what CI runs', () => {
    const jobs = workflow(`${WORKFLOWS}/ci.yml`).jobs;
    const runBy = new Map([
        ['tests/run-unit-tests.sh', ['Unit tests (gcc)', 'Unit tests (clang)']],
        ['tests/e2e/run.sh', ['E2E (tools)']],
    ]);
    for (const page of ['AGENTS.md', 'CONTRIBUTING.md']) {
        const commands = [...section(page, '## Tests').matchAll(/^(tests\/\S+) +#/gm)].map((m) => m[1]);
        assert.deepEqual(commands, [...runBy.keys()], `${page}: the entry points`);
    }
    for (const [script, names] of runBy) {
        assert.ok(fs.statSync(path.join(repoRoot, script)).mode & 0o100, `${script} is not executable`);
        for (const name of names) {
            assert.ok(jobs.find((j) => j.name === name).body.includes(script), `${name} does not run ${script}`);
        }
    }
});

test('CONTRIBUTING.md names the tools the end-to-end run tests and how CI runs the script tests', () => {
    const text = section('CONTRIBUTING.md', '## Tests');
    const e2e = read('tests/e2e/run.sh') + read('tests/e2e/tool-regressions.sh');
    const [, tools] = /^tests\/e2e\/run\.sh +# builds the tools \(([^)]*)\)/m.exec(text) ?? [];
    assert.ok(tools, 'no list of tools');
    for (const tool of tools.replace(/\.\.\.$/, '').split(', ')) assert.ok(e2e.includes(tool), `${tool} is not in the end-to-end run`);
    const agentTooling = read(`${WORKFLOWS}/agent-tooling.yml`);
    const command = "node --test 'scripts/tests/*.test.mjs'";
    assert.ok(text.includes(`\`${command}\``), 'no command for the script tests');
    assert.ok(agentTooling.includes(command), 'agent-tooling.yml runs the scripts another way');
    const node = /node-version: '(\d+)'/.exec(agentTooling)?.[1];
    assert.ok(flat(text).includes(`(Node ${node} or newer)`), `CI uses Node ${node}`);
});
