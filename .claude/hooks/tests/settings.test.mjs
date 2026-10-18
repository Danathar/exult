// Structural checks on .claude/settings.json: it parses, registers the Bash
// guard, pre-approves only the contract commands, asks before Tier 3 edits
// (docs/risk-tiers.md) and denies the commands the repository rules forbid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const settings = JSON.parse(readFileSync(`${ROOT}.claude/settings.json`, 'utf8'));
const { allow, ask, deny } = settings.permissions;

test('registers the guard-bash hook for the Bash tool, and the file exists', () => {
    const entry = settings.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
    assert.ok(entry, 'no PreToolUse hook for Bash');
    assert.match(entry.hooks[0].command, /\.claude\/hooks\/guard-bash\.mjs/);
    assert.ok(existsSync(`${ROOT}.claude/hooks/guard-bash.mjs`));
});

test('allow rules are the contract commands (node --test only in quoted glob form)', () => {
    for (const rule of [
        'Bash(tests/run-unit-tests.sh)',
        'Bash(tests/e2e/run.sh)',
        "Bash(node --test '.claude/hooks/tests/*.test.mjs')",
        "Bash(node --test 'scripts/tests/*.test.mjs')",
        'Bash(node scripts/check-policies.mjs)',
    ]) {
        assert.ok(allow.includes(rule), `${rule} is not allowed`);
    }
    assert.deepEqual(allow.filter((r) => /node --test[^']*\/\)/.test(r)), [], 'directory form of node --test');
    assert.deepEqual(allow.filter((r) => /^Bash\((sudo|su|doas|pkexec|apt|dnf|make install|git push)/.test(r)), []);
});

test('every Tier 3 path of risk-config.json asks before Edit and Write', () => {
    const risk = JSON.parse(readFileSync(`${ROOT}risk-config.json`, 'utf8'));
    const tier3 = risk.tiers.find((t) => t.tier === 3).paths;
    assert.ok(tier3.length > 10);
    for (const path of tier3) {
        for (const tool of ['Edit', 'Write']) assert.ok(ask.includes(`${tool}(${path})`), `${tool}(${path}) does not ask`);
    }
    assert.ok(ask.includes('Bash(git push:*)'));
});

test('deny rules cover force pushes, reset --hard, extra remotes, merging, privilege, make install and package managers', () => {
    for (const rule of [
        'Bash(git push --force:*)', 'Bash(git push -f:*)', 'Bash(git push --force-with-lease:*)', 'Bash(git reset --hard:*)',
        'Bash(git remote add:*)', 'Bash(gh pr merge:*)', 'Bash(sudo:*)', 'Bash(make install:*)', 'Bash(dnf:*)', 'Bash(apt-get:*)',
    ]) {
        assert.ok(deny.includes(rule), `${rule} is not denied`);
    }
});
