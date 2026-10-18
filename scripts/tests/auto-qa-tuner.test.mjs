import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { analyze, percentile, renderReport, validateTuning, workflowStats, durationMinutes } from '../auto-qa-tuner.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const NOW = new Date('2026-10-18T00:00:00Z');

const tuning = {
    window_days: 14,
    min_runs: 3,
    failure_rate_threshold: 0.3,
    flaky_rate_threshold: 0.1,
    slow_p95_minutes: 30,
    timeout_headroom_factor: 1.5,
    workflows: ['CI'],
};

let n = 0;
function run(over = {}) {
    n += 1;
    return {
        workflowName: 'CI',
        conclusion: 'success',
        headSha: `sha${n}`,
        event: 'push',
        createdAt: '2026-10-10T00:00:00Z',
        startedAt: '2026-10-10T00:00:00Z',
        updatedAt: '2026-10-10T00:10:00Z',
        ...over,
    };
}

test('the shipped tuning file is valid', () => {
    const t = validateTuning(JSON.parse(readFileSync(join(repoRoot, '.github/auto-qa-tuning.json'), 'utf8')));
    assert.ok(t.workflows.includes('CI'));
});

test('validateTuning rejects bad values', () => {
    assert.throws(() => validateTuning({ ...tuning, min_runs: 0 }), /min_runs/);
    assert.throws(() => validateTuning({ ...tuning, flaky_rate_threshold: 2 }), /at most 1/);
    assert.throws(() => validateTuning({ ...tuning, workflows: [] }), /workflows/);
    assert.throws(() => validateTuning(null), /object/);
});

test('percentile uses nearest rank', () => {
    assert.equal(percentile([], 95), null);
    assert.equal(percentile([5], 95), 5);
    assert.equal(percentile([1, 2, 3, 4, 100], 95), 100);
    assert.equal(percentile([1, 2, 3, 4, 100], 50), 3);
});

test('durationMinutes rejects missing or negative spans', () => {
    assert.equal(durationMinutes(run()), 10);
    assert.equal(durationMinutes({ startedAt: 'x', updatedAt: 'y' }), null);
    assert.equal(durationMinutes({ startedAt: '2026-10-10T01:00:00Z', updatedAt: '2026-10-10T00:00:00Z' }), null);
});

test('a re-run that passed counts the commit as flaky', () => {
    const runs = [
        run({ headSha: 'a', conclusion: 'failure' }),
        run({ headSha: 'a', conclusion: 'success' }),
        run({ headSha: 'b' }),
        run({ headSha: 'c' }),
    ];
    const s = workflowStats(runs);
    assert.equal(s.groups, 3);
    assert.equal(s.flakyGroups, 1);
    assert.equal(s.failed, 1);
});

test('cancelled and skipped runs are ignored', () => {
    const s = workflowStats([run({ conclusion: 'cancelled' }), run({ conclusion: 'skipped' }), run()]);
    assert.equal(s.completed, 1);
    assert.equal(s.failed, 0);
});

test('healthy history yields no findings', () => {
    const r = analyze([run(), run(), run(), run()], tuning, NOW);
    assert.deepEqual(r.findings, []);
    assert.match(renderReport(r, tuning), /No follow-up warranted/);
});

test('too few runs is insufficient data, never a finding', () => {
    const r = analyze([run({ conclusion: 'failure' }), run({ conclusion: 'failure' })], tuning, NOW);
    assert.deepEqual(r.findings, []);
    assert.equal(r.rows[0].insufficient, true);
    assert.match(renderReport(r, tuning), /insufficient data/);
});

test('a high failure rate is flagged', () => {
    const runs = [run({ conclusion: 'failure' }), run({ conclusion: 'failure' }), run(), run()];
    const r = analyze(runs, tuning, NOW);
    assert.deepEqual(r.findings.map((f) => f.kind), ['failing']);
});

test('flakiness is flagged and reported with the threshold', () => {
    const runs = [
        run({ headSha: 'a', conclusion: 'failure' }),
        run({ headSha: 'a' }),
        run({ headSha: 'b' }),
        run({ headSha: 'c' }),
        run({ headSha: 'd' }),
        run({ headSha: 'e' }),
        run({ headSha: 'f' }),
        run({ headSha: 'g' }),
        run({ headSha: 'h' }),
        run({ headSha: 'i' }),
        run({ headSha: 'j' }),
        run({ headSha: 'k' }),
    ];
    const r = analyze(runs, { ...tuning, failure_rate_threshold: 1, flaky_rate_threshold: 0.05 }, NOW);
    assert.deepEqual(r.findings.map((f) => f.kind), ['flaky']);
    assert.match(r.findings[0].detail, /1 of 11 /);
});

test('slow runs propose a rounded timeout from the tuning headroom factor', () => {
    const slow = { updatedAt: '2026-10-10T00:40:00Z' };
    const r = analyze([run(slow), run(slow), run(slow)], tuning, NOW);
    assert.deepEqual(r.findings.map((f) => f.kind), ['slow']);
    // p95 40 min x 1.5 = 60, already a multiple of 5.
    assert.match(r.findings[0].suggestion, /compare timeout-minutes in the workflow with 60/);
});

test('changing the tuning file changes the outcome (it is actually read)', () => {
    const runs = [run({ conclusion: 'failure' }), run({ conclusion: 'failure' }), run(), run()];
    assert.equal(analyze(runs, tuning, NOW).findings.length, 1);
    assert.equal(analyze(runs, { ...tuning, failure_rate_threshold: 0.9 }, NOW).findings.length, 0);
});

test('runs older than the window are ignored', () => {
    const old = { createdAt: '2026-08-01T00:00:00Z' };
    const r = analyze([run({ ...old, conclusion: 'failure' }), run(old), run(old), run(old)], tuning, NOW);
    assert.equal(r.rows[0].stats.completed, 0);
});

test('CLI reads the tuning file from --root, writes output and sets the step output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'autoqa-'));
    try {
        mkdirSync(join(dir, '.github'));
        writeFileSync(join(dir, '.github/auto-qa-tuning.json'), JSON.stringify(tuning));
        const runs = [run({ conclusion: 'failure' }), run({ conclusion: 'failure' }), run(), run()];
        writeFileSync(join(dir, 'runs.json'), JSON.stringify(runs));
        const out = join(dir, 'out');
        const gh = join(dir, 'gh-output');
        const res = spawnSync(
            process.execPath,
            [join(repoRoot, 'scripts/auto-qa-tuner.mjs'), '--root', dir, '--runs', join(dir, 'runs.json'), '--out-dir', out, '--now', NOW.toISOString()],
            { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: gh } }
        );
        assert.equal(res.status, 0, res.stderr);
        assert.match(readFileSync(join(out, 'issue-body.md'), 'utf8'), /failing/);
        assert.equal(readFileSync(gh, 'utf8').trim(), 'findings=true');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('CLI exits 2 without --runs', () => {
    const res = spawnSync(process.execPath, [join(repoRoot, 'scripts/auto-qa-tuner.mjs')], { encoding: 'utf8', cwd: repoRoot });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /--runs/);
});
