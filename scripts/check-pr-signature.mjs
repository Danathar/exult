#!/usr/bin/env node
/**
 * Pull-request-time half of the agent audit's `signature` and `linked-issue`
 * requirements.
 *
 * `scripts/ai-audit-report.mjs` reads merged pull requests weekly and flags an
 * agent PR whose body has no `— hive: agent=...` line, or no link to an issue
 * in this repository; by then the body can no longer be fixed.
 * `.github/workflows/agent-signature.yml` runs this script on an open agent PR
 * instead, so the body can be fixed before merge.
 *
 * It uses the audit's own `findSignature` and `hasLinkedIssue`, so the two
 * checks cannot disagree about what counts as a signature line or an issue
 * link (fenced code blocks are skipped the same way). Only the body is passed
 * to `hasLinkedIssue`, not GitHub's resolved `closingIssuesReferences`: that is
 * stricter than the audit, never looser, since a body with `Closes #N`
 * satisfies both.
 *
 * Input: the PR body in the `PR_BODY` environment variable (the workflow sets
 * it through `env:`, never by expanding the body into the script).
 * Exit codes: 0 the body has both; 1 either is missing (every missing one is
 * reported).
 */

import { fileURLToPath } from 'node:url';
import { findSignature, hasLinkedIssue } from './ai-audit-report.mjs';

/**
 * Runs the check; returns the exit code. The body is never echoed: it is
 * attacker-editable text and could carry workflow commands.
 */
export function main(env = process.env, stdout = process.stdout, stderr = process.stderr) {
    const audit = 'The weekly agent audit (agent-audit.yml) will flag this PR once merged.';
    const fix = 'Edit the PR description to add the line; this check reruns on edit.';
    let code = 0;

    if (findSignature(env.PR_BODY)) {
        stdout.write('The pull request body has a `— hive: agent=...` signature line.\n');
    } else {
        stderr.write(
            '::error::The pull request body has no `— hive: agent=<name> ...` signature line ' +
                `(outside code blocks). ${audit} ${fix}\n`,
        );
        code = 1;
    }

    if (hasLinkedIssue({ body: env.PR_BODY })) {
        stdout.write('The pull request body links an issue in this repository.\n');
    } else {
        stderr.write(
            '::error::The pull request body has no `Closes #N`, `Fixes #N`, `Resolves #N` or ' +
                '`Refs #N` line naming an issue in this repository (outside code blocks). A ' +
                'reference to another repository (`Refs owner/repo#N`) does not count. ' +
                `${audit} ${fix}\n`,
        );
        code = 1;
    }

    return code;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
