#!/usr/bin/env node
// Self-tuning QA signal check. Reads recent GitHub Actions runs and the rules in
// .github/auto-qa-tuning.json, and proposes follow-ups: workflows that fail
// often, are flaky (a re-run of the same commit passed), or run slower than
// their budget. It never edits a workflow or the tuning file and never
// commits; output goes to --out-dir for the workflow to publish as a step
// summary and a tracking issue.
//
// A re-run that passed (attempt > 1, success) counts as flaky: the earlier
// attempt is not in `gh run list` output, but a re-run is only worth doing after
// a failure. A re-run of a cancelled run would be counted too; that is a known
// over-count.
//
// "Slow" is judged from job times, not run times: a run's createdAt/startedAt
// is when it was queued, so updatedAt minus startedAt includes every minute
// its jobs waited for a runner. A run's execution time is its longest job's
// started_at..completed_at, which is also what a job's timeout-minutes limits.
// The longest wait for a runner (job created_at..started_at) is reported
// alongside it, for information only.
//
// Inputs:
//   --runs: JSON array from
//     gh run list --repo Danathar/exult --limit 1000 --created ">=YYYY-MM-DD" \
//       --json workflowName,conclusion,status,headSha,event,headBranch,attempt,createdAt,startedAt,updatedAt,databaseId,url
//   --jobs: JSON array of the jobs of those runs, from
//     gh api repos/Danathar/exult/actions/runs/<databaseId>/jobs --paginate \
//       --jq '.jobs[] | {run_id, name, conclusion, created_at, started_at, completed_at}'
//     (only successful runs are timed, so only their jobs are needed).
//
// Usage: node scripts/auto-qa-tuner.mjs --runs runs.json --jobs jobs.json [--root <dir>] [--out-dir <dir>] [--now <ISO date>]
// Exit: 0 report written (findings or not); 2 bad usage or unreadable input.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const COMPLETED = new Set(['success', 'failure', 'timed_out']);
const NUMERIC_RULES = [
    ['window_days', 1],
    ['min_runs', 1],
    ['failure_rate_threshold', 0],
    ['flaky_rate_threshold', 0],
    ['slow_p95_minutes', 1],
    ['timeout_headroom_factor', 1],
];

/** Validates the tuning file; throws a readable error for a bad value. */
export function validateTuning(t) {
    if (!t || typeof t !== 'object') throw new Error('tuning file must be a JSON object');
    for (const [key, min] of NUMERIC_RULES) {
        if (typeof t[key] !== 'number' || !Number.isFinite(t[key]) || t[key] < min) {
            throw new Error(`tuning ${key} must be a number >= ${min}`);
        }
    }
    if (t.failure_rate_threshold > 1 || t.flaky_rate_threshold > 1) {
        throw new Error('rate thresholds must be at most 1');
    }
    if (!Array.isArray(t.workflows) || t.workflows.length === 0 || t.workflows.some((w) => typeof w !== 'string')) {
        throw new Error('tuning workflows must be a non-empty array of workflow names');
    }
    return t;
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Minutes from ISO time `from` to ISO time `to`, or null when either is unusable or `to` is earlier. */
function spanMinutes(from, to) {
    const a = Date.parse(from ?? '');
    const b = Date.parse(to ?? '');
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
    return (b - a) / 60000;
}

/**
 * Timing of one run from its jobs (GitHub API job objects). `execMinutes` is
 * the longest job's started_at..completed_at; `waitMinutes` is the longest any
 * job waited for a runner (created_at..started_at). Skipped jobs never ran and
 * are ignored. A field is null when no job has usable times for it.
 */
export function runTiming(jobs) {
    let execMinutes = null;
    let waitMinutes = null;
    for (const j of jobs) {
        if (j.conclusion === 'skipped') continue;
        const exec = spanMinutes(j.started_at, j.completed_at);
        if (exec !== null && (execMinutes === null || exec > execMinutes)) execMinutes = exec;
        const wait = spanMinutes(j.created_at, j.started_at);
        if (wait !== null && (waitMinutes === null || wait > waitMinutes)) waitMinutes = wait;
    }
    return { execMinutes, waitMinutes };
}

/** Nearest-rank percentile (p in 0..100) of a numeric array; null when empty. */
export function percentile(values, p) {
    if (values.length === 0) return null;
    const s = [...values].sort((x, y) => x - y);
    const rank = Math.max(1, Math.ceil((p / 100) * s.length));
    return s[rank - 1];
}

/**
 * Stats for the completed runs of one workflow.
 * @param {object[]} runs gh run list output for one workflow
 * @param {Map<string, object[]>} jobsByRun jobs keyed by String(run id)
 */
export function workflowStats(runs, jobsByRun = new Map()) {
    const done = runs.filter((r) => COMPLETED.has(r.conclusion));
    const failed = done.filter((r) => r.conclusion !== 'success');
    const groups = new Map();
    for (const r of done) {
        const key = `${r.headSha}\u0000${r.event}`;
        const g = groups.get(key) ?? { ok: false, bad: false, retried: false };
        if (r.conclusion === 'success') {
            g.ok = true;
            // `gh run list` shows only the latest attempt of a run: a re-run
            // that passed replaces the failed attempt, so it appears as a
            // success with attempt > 1.
            if (Number(r.attempt) > 1) g.retried = true;
        } else g.bad = true;
        groups.set(key, g);
    }
    const flaky = [...groups.values()].filter((g) => (g.ok && g.bad) || g.retried).length;
    const timings = done
        .filter((r) => r.conclusion === 'success')
        .map((r) => runTiming(jobsByRun.get(String(r.databaseId)) ?? []));
    const notNull = (v) => v !== null;
    return {
        completed: done.length,
        failed: failed.length,
        failureRate: done.length ? failed.length / done.length : 0,
        groups: groups.size,
        flakyGroups: flaky,
        flakyRate: groups.size ? flaky / groups.size : 0,
        p95Minutes: percentile(timings.map((t) => t.execMinutes).filter(notNull), 95),
        waitP95Minutes: percentile(timings.map((t) => t.waitMinutes).filter(notNull), 95),
    };
}

/** Next multiple of 5 at or above n. */
const roundUp5 = (n) => Math.ceil(n / 5) * 5;

/**
 * @param {object[]} runs gh run list output
 * @param {object[]} jobs GitHub API job objects of those runs (each has run_id)
 * @param {object} tuning validated .github/auto-qa-tuning.json
 * @param {Date} now
 * @returns {{window: string, rows: object[], findings: object[]}}
 */
export function analyze(runs, jobs, tuning, now = new Date()) {
    const cutoff = now.getTime() - tuning.window_days * 86400000;
    const recent = runs.filter((r) => {
        const t = Date.parse(r.createdAt ?? '');
        return Number.isFinite(t) && t >= cutoff;
    });
    const jobsByRun = new Map();
    for (const j of jobs) {
        const key = String(j.run_id);
        if (!jobsByRun.has(key)) jobsByRun.set(key, []);
        jobsByRun.get(key).push(j);
    }
    const rows = [];
    const findings = [];
    for (const name of tuning.workflows) {
        const stats = workflowStats(
            recent.filter((r) => r.workflowName === name),
            jobsByRun
        );
        const row = { name, stats, insufficient: stats.completed < tuning.min_runs };
        rows.push(row);
        if (row.insufficient) continue;
        if (stats.failureRate > tuning.failure_rate_threshold) {
            findings.push({
                workflow: name,
                kind: 'failing',
                detail: `${stats.failed} of ${stats.completed} completed runs failed (${round(stats.failureRate * 100, 1)}%, threshold ${round(tuning.failure_rate_threshold * 100, 1)}%).`,
                suggestion: 'Find the common cause in the failed runs and fix it, or fix the workflow itself if it is the broken part.',
            });
        }
        if (stats.flakyRate > tuning.flaky_rate_threshold) {
            findings.push({
                workflow: name,
                kind: 'flaky',
                detail: `${stats.flakyGroups} of ${stats.groups} commit/event groups were flaky (failed and passed, or passed only on a re-run) (${round(stats.flakyRate * 100, 1)}%, threshold ${round(tuning.flaky_rate_threshold * 100, 1)}%).`,
                suggestion: 'A re-run changed the result, so something is nondeterministic (network fetches, timing, runner image drift). Find it. A flaky check that is required for merging blocks and misleads.',
            });
        }
        if (stats.p95Minutes !== null && stats.p95Minutes > tuning.slow_p95_minutes) {
            const timeout = roundUp5(stats.p95Minutes * tuning.timeout_headroom_factor);
            findings.push({
                workflow: name,
                kind: 'slow',
                detail: `p95 of the longest job in successful runs is ${round(stats.p95Minutes, 1)} min (threshold ${tuning.slow_p95_minutes} min). Time spent waiting for a runner is not counted.`,
                suggestion: `Look for caching or parallelism gains first. If the time is expected, compare timeout-minutes in the workflow with ${timeout} (p95 x ${tuning.timeout_headroom_factor}, rounded up to 5).`,
            });
        }
    }
    return { window: `${tuning.window_days} days up to ${now.toISOString().slice(0, 10)}`, rows, findings };
}

export function renderReport(result, tuning) {
    const out = ['## Auto-QA signal check', ''];
    out.push(
        `Window: ${result.window}. Rules from \`.github/auto-qa-tuning.json\`: failure rate > ${round(tuning.failure_rate_threshold * 100, 1)}%, flaky rate > ${round(tuning.flaky_rate_threshold * 100, 1)}%, longest-job p95 > ${tuning.slow_p95_minutes} min, at least ${tuning.min_runs} completed runs. Nothing is changed automatically.`,
        '',
        'Job p95 is the 95th percentile, over successful runs, of the longest job (started to completed). Runner wait p95 is the same for the longest time a job waited for a runner; it is shown for information and never flagged.',
        '',
        '| Workflow | Completed | Failed | Flaky groups | Job p95 (min) | Runner wait p95 (min) | Result |',
        '| --- | ---: | ---: | ---: | ---: | ---: | --- |'
    );
    for (const row of result.rows) {
        const s = row.stats;
        const flagged = result.findings.filter((f) => f.workflow === row.name).map((f) => f.kind);
        const verdict = row.insufficient
            ? `insufficient data (< ${tuning.min_runs} runs)`
            : flagged.length
              ? `flagged: ${flagged.join(', ')}`
              : 'ok';
        const min = (v) => (v === null ? '-' : round(v, 1));
        out.push(
            `| ${row.name} | ${s.completed} | ${s.failed} | ${s.flakyGroups}/${s.groups} | ${min(s.p95Minutes)} | ${min(s.waitP95Minutes)} | ${verdict} |`
        );
    }
    out.push('');
    if (result.findings.length === 0) {
        out.push('No follow-up warranted.');
    } else {
        out.push('### Proposed follow-ups', '');
        for (const f of result.findings) {
            out.push(`- **${f.workflow}** (${f.kind}): ${f.detail} ${f.suggestion}`);
        }
    }
    return out.join('\n') + '\n';
}

function main(argv) {
    const arg = (name, dflt) => {
        const i = argv.indexOf(name);
        return i >= 0 ? argv[i + 1] : dflt;
    };
    const root = resolve(arg('--root', process.cwd()));
    const outDir = resolve(arg('--out-dir', 'auto-qa-out'));
    const runsPath = arg('--runs', null);
    const jobsPath = arg('--jobs', null);
    let tuning;
    let runs;
    let jobs;
    let now;
    try {
        if (!runsPath) throw new Error('--runs <file> is required');
        if (!jobsPath) throw new Error('--jobs <file> is required');
        tuning = validateTuning(JSON.parse(readFileSync(resolve(root, '.github/auto-qa-tuning.json'), 'utf8')));
        runs = JSON.parse(readFileSync(resolve(runsPath), 'utf8'));
        if (!Array.isArray(runs)) throw new Error('runs file must be a JSON array');
        jobs = JSON.parse(readFileSync(resolve(jobsPath), 'utf8'));
        if (!Array.isArray(jobs)) throw new Error('jobs file must be a JSON array');
        now = new Date(arg('--now', new Date().toISOString()));
        if (Number.isNaN(now.getTime())) throw new Error('--now must be a date');
    } catch (err) {
        process.stderr.write(`auto-qa-tuner: ${err.message}\n`);
        process.exit(2);
    }
    const result = analyze(runs, jobs, tuning, now);
    const report = renderReport(result, tuning);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'report.md'), report);
    writeFileSync(resolve(outDir, 'issue-body.md'), result.findings.length ? report : '');
    process.stdout.write(report);
    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `findings=${result.findings.length > 0}\n`);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main(process.argv.slice(2));
}
