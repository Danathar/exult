// docs/metrics.md says what scripts/pr-metrics.mjs reports, which flags it
// takes and what the weekly pr-metrics.yml run does with it. Nothing read the
// page: pr-metrics.test.mjs tests the script but never opens the page, so a
// metric, an author class or a flag added to the script, or a schedule,
// artifact or permission changed in the workflow, could leave the page behind
// without a test failing. These tests hold the page's three sections to the
// script and the workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AUTHOR_CLASSES,
    DEFAULT_OWNER,
    DEFAULT_WINDOW_DAYS,
    HIVE_LOGIN,
    classifyAuthor,
    computeMetrics,
    formatRate,
    renderMarkdown,
    summarize,
} from '../pr-metrics.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const PAGE = 'docs/metrics.md';
const SCRIPT = 'scripts/pr-metrics.mjs';
const WORKFLOW = '.github/workflows/pr-metrics.yml';

const codeSpans = (text) => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

function section(heading) {
    const lines = read(PAGE).split('\n');
    const start = lines.indexOf(heading);
    assert.notEqual(start, -1, `${PAGE} has no ${JSON.stringify(heading)} heading`);
    const end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
    return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

// The body rows of the first table after `intro`, as arrays of cells.
function table(text, intro) {
    const lines = text.slice(text.indexOf(intro)).split('\n');
    const start = lines.findIndex((l) => l.startsWith('|'));
    const rows = [];
    for (let i = start; i < lines.length && lines[i].startsWith('|'); i++) {
        rows.push(lines[i].slice(1, -1).split('|').map((c) => c.trim()));
    }
    assert.ok(rows.length > 2, `${PAGE}: no table after ${JSON.stringify(intro)}`);
    return rows.slice(2);
}

// The `--json` field list and `--limit` of a `gh pr list` command.
function ghList(text) {
    const m = /gh pr list --repo \S+ --state all --limit (\d+) \\\s*\n[\s/]*--json ([\w,]+)/.exec(text);
    assert.ok(m, 'no gh pr list command with --limit and --json');
    return { limit: m[1], fields: m[2] };
}

// Flags the script's parseArgs accepts.
function scriptFlags() {
    const flags = [...read(SCRIPT).matchAll(/a === '(--[\w-]+)'/g)].map((m) => m[1]);
    assert.ok(flags.length > 0, `${SCRIPT}: the flag reader found no flags`);
    return flags.sort();
}

const runScript = (args, opts = {}) =>
    execFileSync(process.execPath, [path.join(repoRoot, SCRIPT), ...args], { encoding: 'utf8', ...opts });

// The metric names of the table, and the field of a summary each one is.
const METRIC_FIELDS = {
    merged: 'merged',
    'closed unmerged': 'closedUnmerged',
    open: 'open',
    'acceptance rate': 'acceptanceRate',
    'time to merge': 'timeToMergeHours',
};

test('What is computed: the metric table names every field a summary reports, and no other', () => {
    const rows = table(section('## What is computed'), '| metric | definition |');
    const names = rows.map(([name]) => name);
    assert.deepEqual(names.filter((n) => !(n in METRIC_FIELDS)), [], 'metrics the page names that the test does not map to a field');
    assert.deepEqual(
        names.map((n) => METRIC_FIELDS[n]).sort(),
        Object.keys(summarize([], { nowMs: 0 })).sort(),
    );
});

test('What is computed: an undecided class reads n/a, and time to merge reports median and p90', () => {
    const rows = Object.fromEntries(table(section('## What is computed'), '| metric | definition |'));
    assert.match(rows['acceptance rate'], /`n\/a` when nothing is decided/);
    assert.equal(formatRate(summarize([], { nowMs: 0 })), 'n/a');
    assert.match(rows['time to merge'], /Median .* and p90/);
    assert.deepEqual(Object.keys(summarize([], { nowMs: 0 }).timeToMergeHours).sort(), ['median', 'p90', 'samples']);
});

test('What is computed: the windows are all time and the default recent window', () => {
    const text = section('## What is computed');
    const m = /\*\*last (\d+) days\*\* \(`--window-days` changes the\s+(\d+)\)/.exec(text);
    assert.ok(m, `${PAGE}: no "last N days" window sentence`);
    assert.equal(Number(m[1]), DEFAULT_WINDOW_DAYS);
    assert.equal(Number(m[2]), DEFAULT_WINDOW_DAYS);
    assert.ok(scriptFlags().includes('--window-days'));
    const labels = Object.values(computeMetrics([], { now: '2026-10-09T00:00:00Z' }).windows).map((w) => w.label);
    assert.deepEqual(labels, ['all time', `last ${DEFAULT_WINDOW_DAYS} days`]);
    assert.match(text, /\*\*all time\*\*/);
});

test('What is computed: the page\'s 40-days-open, merged-yesterday example counts in the recent window', () => {
    assert.match(section('## What is computed'), /a PR opened 40 days ago and merged\s+yesterday counts as "last 30 days" and its 40-day wait counts/);
    const now = Date.parse('2026-10-09T00:00:00Z');
    const day = 24 * 3_600_000;
    const pr = {
        number: 1,
        author: { login: DEFAULT_OWNER },
        state: 'MERGED',
        createdAt: new Date(now - 40 * day).toISOString(),
        mergedAt: new Date(now - day).toISOString(),
    };
    const recent = computeMetrics([pr], { now: new Date(now), windowDays: 30 }).windows.last30d.overall;
    assert.equal(recent.merged, 1);
    assert.equal(recent.timeToMergeHours.median, 39 * 24);
});

test('What is computed: the author class table matches the classes the script reports', () => {
    const rows = table(section('## What is computed'), '| class | who |');
    const report = renderMarkdown(computeMetrics([], { now: '2026-10-09T00:00:00Z' }));
    const reported = [...report.matchAll(/^\| ([^|]+?) \| \d/gm)].map((m) => m[1]).filter((l) => l !== 'all');
    assert.deepEqual(rows.map(([name]) => name), reported.slice(0, AUTHOR_CLASSES.length));
    assert.equal(reported.length, 2 * AUTHOR_CLASSES.length);
});

test('What is computed: the logins each class row gives are classified into that class', () => {
    const rows = Object.fromEntries(table(section('## What is computed'), '| class | who |'));
    const want = { owner: 'owner', 'Hive app': 'hive', 'other bots': 'other-bot' };
    const owner = codeSpans(rows.owner);
    assert.deepEqual(owner, [DEFAULT_OWNER, '--owner']);
    assert.ok(scriptFlags().includes('--owner'));
    const hive = codeSpans(rows['Hive app']);
    assert.deepEqual(hive, [`app/${HIVE_LOGIN}`, `${HIVE_LOGIN}[bot]`]);
    for (const [name, logins] of [['owner', [DEFAULT_OWNER]], ['Hive app', hive], ['other bots', codeSpans(rows['other bots'])]]) {
        assert.ok(logins.length > 0, `${name}: no login in the row`);
        for (const login of logins) {
            assert.equal(classifyAuthor({ login }), want[name], `${name}: ${login}`);
        }
    }
    assert.equal(classifyAuthor({ login: 'someone-else', is_bot: false }), 'other-human');
});

test('Run it locally: the options the page names are exactly the flags the script takes', () => {
    const text = section('## Run it locally');
    const commands = text.split('\n').filter((l) => /node scripts\/pr-metrics\.mjs/.test(l));
    assert.ok(commands.length > 0, `${PAGE}: no node scripts/pr-metrics.mjs command`);
    const options = /Options: ([\s\S]*?)\. The script/.exec(text);
    assert.ok(options, `${PAGE}: no Options: sentence`);
    const named = new Set([
        ...commands.flatMap((l) => l.match(/--[\w-]+/g) ?? []),
        ...codeSpans(options[1]).map((s) => s.split(' ')[0]),
    ]);
    assert.deepEqual([...named].sort(), scriptFlags());
});

test('Run it locally: the page\'s commands run as written', () => {
    const text = section('## Run it locally');
    assert.match(text, /--input prs\.json\s+# markdown tables/);
    assert.match(text, /--input prs\.json --format json\s+# machine-readable/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-page-'));
    try {
        const input = path.join(dir, 'prs.json');
        fs.writeFileSync(input, '[]\n');
        assert.match(runScript(['--input', input]), /^# PR metrics\n/);
        assert.equal(JSON.parse(runScript(['--input', input, '--format', 'json'])).totalPrs, 0);
        assert.match(runScript([], { input: '[]' }), /^# PR metrics\n/);
        const out = path.join(dir, 'metrics.json');
        const now = '2026-10-09T00:00:00Z';
        runScript(['--input', input, '--now', now, '--json-out', out]);
        assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).generatedAt, '2026-10-09T00:00:00.000Z');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('Run it locally: the script needs only Node, and its tests are where the page says', () => {
    const text = section('## Run it locally');
    assert.match(text, /needs only\s+Node \(no npm packages\)/);
    const imports = [...read(SCRIPT).matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    assert.ok(imports.length > 0);
    assert.deepEqual(imports.filter((s) => !s.startsWith('node:')), []);
    const testFile = 'scripts/tests/pr-metrics.test.mjs';
    assert.ok(text.includes(`\`node --test ${testFile}\``));
    assert.ok(fs.existsSync(path.join(repoRoot, testFile)));
});

test('Run it locally: the gh command is the one the script and the workflow use', () => {
    const page = ghList(section('## Run it locally'));
    assert.match(section('## Run it locally'), new RegExp(`\`--limit ${page.limit}\` is a ceiling`));
    assert.deepEqual(ghList(read(WORKFLOW).replace(/"\$GH_REPO"/, 'Danathar/exult')), page);
    assert.deepEqual(ghList(read(SCRIPT)), page);
    // Every field the script reads from a PR is one the command asks for.
    const fields = page.fields.split(',');
    for (const f of ['author', 'state', 'createdAt', 'mergedAt', 'closedAt']) assert.ok(fields.includes(f), f);
});

test('Weekly run: schedule, artifact, retention and permissions are as the page says', () => {
    const text = section('## Weekly run');
    const wf = read(WORKFLOW);
    assert.match(text, /runs\s+every Monday \(and on demand from the Actions tab\)/);
    const cron = /cron: '([^']+)'/.exec(wf);
    assert.ok(cron, `${WORKFLOW}: no cron schedule`);
    assert.equal([...wf.matchAll(/cron: /g)].length, 1, `${WORKFLOW}: more than one schedule`);
    assert.equal(cron[1].split(/\s+/)[4], '1', 'the cron does not run on Mondays only');
    assert.match(wf, /^ {2}workflow_dispatch:/m);

    assert.match(text, /writes the markdown to the run's step summary/);
    assert.match(wf, /cat pr-metrics\.md >> "\$GITHUB_STEP_SUMMARY"/);

    const m = /uploads\s+`([^`]+)` and `([^`]+)` as the `([^`]+)` artifact for (\d+)\s+days/.exec(text);
    assert.ok(m, `${PAGE}: no upload sentence`);
    const upload = /uses: actions\/upload-artifact@\S+\n\s+with:\n\s+name: (\S+)\n\s+path: \|\n((?:\s+\S+\n)+)\s+retention-days: (\d+)/.exec(wf);
    assert.ok(upload, `${WORKFLOW}: no upload-artifact step the reader understands`);
    assert.equal(upload[1], m[3]);
    assert.deepEqual(upload[2].trim().split(/\s+/), [m[1], m[2]]);
    assert.equal(upload[3], m[4]);
    assert.match(wf, /--json-out pr-metrics\.json/);
    assert.match(wf, /> pr-metrics\.md/);
});

test('Weekly run: read-only and commits nothing', () => {
    assert.match(section('## Weekly run'), /It has read-only permissions and commits nothing/);
    const wf = read(WORKFLOW);
    const block = /^permissions:\n((?: {2}\S.*\n)+)/m.exec(wf);
    assert.ok(block, `${WORKFLOW}: no top-level permissions block`);
    const perms = block[1].trim().split('\n').map((l) => l.trim().split(/:\s*/));
    assert.ok(perms.length > 0);
    assert.deepEqual(perms.filter(([, level]) => level !== 'read'), []);
    assert.doesNotMatch(wf, /^ +permissions:/m, 'a job overrides the read-only permissions');
    assert.doesNotMatch(wf, /git (?:commit|push)|gh (?:issue|pr) (?:create|comment|edit)|gh api/);
});
