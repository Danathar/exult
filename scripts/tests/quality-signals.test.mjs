// The "Signals" table of docs/quality.md lists the checks the repository runs,
// the workflow and jobs each lives in, and whether it blocks a merge. Nothing
// read the table: it had no row for the changed-line mutation check that
// mutation.yml has run on every pull request since #356, and its CI row left
// out the out-of-tree build job ci.yml has run since #75 was fixed. These tests
// hold the table to .github/workflows/ and to .github/rulesets/master.json, so
// a workflow or a job added to one the table names, or a required check
// renamed, has to be written into the table in the same change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const PAGE = 'docs/quality.md';
const WORKFLOWS = '.github/workflows';

// Workflows that check nothing, so the table has no row for them.
const NOT_A_SIGNAL = new Map([
    ['ai-fix.yml', 'starts an agent when an issue or pull request asks for one'],
    ['auto-issues.yml', 'opens an issue when a run on master fails; it reports the other checks'],
    ['claude.yml', 'answers @claude mentions'],
    ['labeler.yml', 'labels pull requests by the paths they change'],
    ['notify.yml', 'upstream: posts upstream CI results to IRC and Discord'],
    ['released.yml', 'upstream: release notifications'],
]);

const codeSpans = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

// A `name*.yml` glob of the table as a regular expression.
const globRegExp = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);

function workflowFiles() {
    return fs.readdirSync(path.join(repoRoot, WORKFLOWS)).filter((f) => /\.ya?ml$/.test(f)).sort();
}

// What a workflow runs on and its jobs' display names. Enough YAML for the
// files here: two-space indents, `on:` as a block, `name:` per job, and a
// `${{ matrix.<key> }}` job name expanded over an inline list or
// `matrix.include` entries.
function workflow(file) {
    const lines = read(`${WORKFLOWS}/${file}`).split('\n');
    const events = [];
    const jobs = [];
    let section = null;
    let job = null;
    const finish = () => {
        if (!job) return;
        const name = job.name ?? job.id;
        const key = /\$\{\{ *matrix\.([\w-]+) *\}\}/.exec(name)?.[1];
        if (key) {
            assert.ok(job.matrix[key]?.length, `${file}: job ${job.id} names matrix.${key}, which the reader found no values for`);
            for (const v of job.matrix[key]) jobs.push(name.replace(/\$\{\{ *matrix\.[\w-]+ *\}\}/, v));
        } else jobs.push(name);
    };
    for (const line of lines) {
        let m;
        if ((m = /^(\S[^:]*):/.exec(line))) {
            section = m[1].replace(/^['"]|['"]$/g, '');
            continue;
        }
        if (section === 'on' && (m = /^ {2}([\w-]+):/.exec(line))) events.push(m[1]);
        if (section !== 'jobs') continue;
        if ((m = /^ {2}([\w-]+):\s*$/.exec(line))) {
            finish();
            job = { id: m[1], name: null, matrix: {} };
        } else if (job && (m = /^ {4}name: *(.+?) *$/.exec(line))) {
            job.name = m[1].replace(/^(['"])(.*)\1$/, '$2');
        } else if (job && (m = /^ {8}([\w-]+): *\[(.*)\] *$/.exec(line))) {
            job.matrix[m[1]] = m[2].split(',').map((v) => v.trim());
        } else if (job && (m = /^ {10}(?:- )?([\w-]+): *(\S.*?) *$/.exec(line))) {
            (job.matrix[m[1]] ??= []).push(m[2]);
        }
    }
    finish();
    return { events, jobs };
}

function section(heading) {
    const lines = read(PAGE).split('\n');
    const start = lines.indexOf(heading);
    assert.notEqual(start, -1, `${PAGE} has no ${JSON.stringify(heading)} heading`);
    const end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
    return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

// A table row's cells, split on `|` outside code spans.
function cells(row) {
    const out = [];
    let cell = '';
    let code = false;
    for (const c of row.slice(1)) {
        if (c === '`') code = !code;
        if (c === '|' && !code) {
            out.push(cell.trim());
            cell = '';
        } else cell += c;
    }
    return out;
}

function signalRows() {
    const rows = section('## Signals').split('\n').filter((l) => l.startsWith('|'));
    const [header, rule, ...body] = rows.map(cells);
    assert.deepEqual(header, ['signal', 'where it lives', 'what it tells you', 'blocks merge']);
    assert.ok(rule.every((c) => /^-+$/.test(c)));
    return body.map(([signal, where, what, blocks]) => {
        const files = codeSpans(where)
            .map((s) => /^(?:\.github\/workflows\/)?([\w*.-]+\.ya?ml)$/.exec(s)?.[1])
            .filter(Boolean);
        // The spans after `job`/`jobs`, up to the first path or file name.
        const listed = /\bjobs? ((?:`[^`]+`(?:, and |, | and )?)+)/.exec(where);
        const spans = listed ? codeSpans(listed[1]) : [];
        const end = spans.findIndex((s) => s.includes('/') || /\.\w+$/.test(s));
        return { signal, where, blocks, files, listedJobs: end === -1 ? spans : spans.slice(0, end) };
    });
}

function rowWorkflows(row) {
    const all = workflowFiles();
    return row.files.flatMap((f) => all.filter((w) => globRegExp(f).test(w)));
}

// Workflows the fork added: the ones policies/workflow-permissions.json does
// not exclude as upstream's.
function forkAdded(file) {
    const policy = JSON.parse(read('policies/workflow-permissions.json'));
    return !policy.excludeGlobs.some((g) => globRegExp(path.basename(g)).test(file));
}

function requiredChecks() {
    const ruleset = JSON.parse(read('.github/rulesets/master.json'));
    const rule = ruleset.rules.find((r) => r.type === 'required_status_checks');
    return rule.parameters.required_status_checks.map((c) => c.context).sort();
}

// The jobs a row names: code spans of its where cell that are display names of
// jobs in the workflows it names.
function namedJobs(row) {
    const jobs = new Set(rowWorkflows(row).flatMap((f) => workflow(f).jobs));
    return codeSpans(row.where).filter((s) => jobs.has(s));
}

test('every workflow is in a row of the table or is listed as checking nothing', () => {
    const named = new Set(signalRows().flatMap(rowWorkflows));
    const missing = workflowFiles().filter((f) => !named.has(f) && !NOT_A_SIGNAL.has(f));
    assert.deepEqual(missing, [], `workflows ${PAGE} has no row for; add a row, or add the file to NOT_A_SIGNAL with the reason`);
});

test('every workflow the table or NOT_A_SIGNAL names exists, and none is both', () => {
    const all = workflowFiles();
    for (const row of signalRows()) {
        for (const f of row.files) assert.ok(all.some((w) => globRegExp(f).test(w)), `${row.signal}: no workflow matches ${f}`);
    }
    for (const f of NOT_A_SIGNAL.keys()) assert.ok(all.includes(f), `NOT_A_SIGNAL names ${f}, which is gone`);
    const named = new Set(signalRows().flatMap(rowWorkflows));
    assert.deepEqual([...NOT_A_SIGNAL.keys()].filter((f) => named.has(f)), []);
});

test('every job a row lists is a job of the workflows it names', () => {
    for (const row of signalRows()) {
        const jobs = new Set(rowWorkflows(row).flatMap((f) => workflow(f).jobs));
        for (const j of row.listedJobs) assert.ok(jobs.has(j), `${row.signal}: ${JSON.stringify(j)} is not a job of ${row.files.join(', ')}`);
    }
});

test('a row naming a fork-added pull request workflow names every job of it', () => {
    let checked = 0;
    for (const row of signalRows()) {
        const named = new Set(namedJobs(row));
        for (const f of rowWorkflows(row).filter(forkAdded)) {
            const { events, jobs } = workflow(f);
            if (!events.includes('pull_request')) continue;
            checked++;
            assert.deepEqual(jobs.filter((j) => !named.has(j)), [], `${row.signal}: jobs of ${f} the row does not name`);
        }
    }
    assert.ok(checked > 0, 'no row names a fork-added pull request workflow');
});

// A row that blocks merge says `yes`, and names in its blocks-merge cell any of
// its jobs that are not required.
test('the jobs the rows mark as blocking merge are exactly the ruleset\'s required checks', () => {
    const blocking = [];
    for (const row of signalRows()) {
        const jobs = namedJobs(row);
        const exempt = new Set(codeSpans(row.blocks));
        for (const j of exempt) assert.ok(jobs.includes(j), `${row.signal}: the blocks-merge cell names ${JSON.stringify(j)}, which the row does not`);
        if (/^yes\b/.test(row.blocks)) blocking.push(...jobs.filter((j) => !exempt.has(j)));
    }
    assert.deepEqual(blocking.sort(), requiredChecks());
});

test('the workflow reader finds the jobs and events the table relies on', () => {
    assert.deepEqual(workflow('ci.yml'), {
        events: ['pull_request', 'push'],
        jobs: ['Unit tests (gcc)', 'Unit tests (clang)', 'E2E (tools)', 'Out-of-tree build (read-only source)'],
    });
    assert.deepEqual(workflow('nightly-compliance.yml').jobs.slice(0, 2), ['Unit tests (g++)', 'Unit tests (clang++)']);
    assert.deepEqual(workflow('mutation.yml'), { events: ['pull_request'], jobs: ['Mutation check (changed lines)'] });
    assert.ok(globRegExp('snapshots*.yml').test('snapshots-android.yml'));
    assert.ok(!globRegExp('ci-*.yml').test('ci.yml'));
});
