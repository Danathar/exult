import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkGhScope, checkRepoTarget, checkRunExpressions, checkSecretScan, listFiles } from '../check-policies.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));

const WORKFLOWS = readJson('policies/workflow-permissions.json');
const TARGET = readJson('policies/repo-target.json');
const CREDENTIALS = readJson('policies/credential-safety.json');

const wfFlags = (cmd) => checkGhScope('w.yml', ['        run: ' + cmd], WORKFLOWS);

function mdFlags(text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-policies-gh-'));
    try {
        fs.mkdirSync(path.join(dir, 'docs'));
        fs.writeFileSync(path.join(dir, 'docs/a.md'), text);
        return checkRepoTarget(dir, TARGET, ['docs/a.md']);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// Flag-first and noun-first spellings of the same write command.
const UNSCOPED_OR_UPSTREAM = [
    'gh -R exult/exult issue create --title x',
    'gh --repo exult/exult pr comment 5 --body x',
    'gh issue -R exult/exult create --title x',
    'gh pr --repo exult/exult merge 5',
    'gh --repo=exult/exult pr merge 5',
    'gh issue create',
    'gh repo delete exult/exult --yes',
    'gh repo edit --visibility private',
    'gh secret set X --repo exult/exult',
    'gh variable delete X',
    'gh gist create notes.txt',
];

test('gh scope: flag-first and noun-first spellings of a write are judged', () => {
    for (const cmd of UNSCOPED_OR_UPSTREAM) {
        assert.ok(wfFlags(cmd).length > 0, `workflow: ${cmd}`);
        assert.ok(mdFlags(cmd + '\n').length > 0, `markdown: ${cmd}`);
    }
});

test('gh scope: flag-first spellings naming this repository pass', () => {
    for (const cmd of [
        'gh -R Danathar/exult issue create --title x',
        'gh --repo Danathar/exult pr comment 5 --body x',
        'gh issue -R Danathar/exult create --title x',
        'gh pr --repo=Danathar/exult merge 5',
        'gh secret set X --repo Danathar/exult',
    ]) {
        assert.deepEqual(wfFlags(cmd), [], `workflow: ${cmd}`);
        assert.deepEqual(mdFlags(cmd + '\n'), [], `markdown: ${cmd}`);
    }
    assert.deepEqual(wfFlags('gh -R ${{ github.repository }} issue create --title x'), []);
    assert.deepEqual(wfFlags('gh issue -R ${{ github.repository }} create --title x'), []);
});

test('gh scope: a later --repo cannot cover an earlier flag naming upstream', () => {
    const v = wfFlags('gh -R exult/exult issue create --repo Danathar/exult');
    assert.equal(v.length, 1);
    assert.match(v[0], /targets "exult\/exult"/);
    assert.ok(mdFlags('gh -R Danathar/exult issue create --repo exult/exult\n').length > 0);
});

test('gh scope: read-only gh commands with a leading flag are not writes', () => {
    for (const cmd of ['gh -R exult/exult issue view 5', 'gh --repo exult/exult pr list', 'gh repo view exult/exult', 'gh repo clone Danathar/exult']) {
        assert.deepEqual(wfFlags(cmd), [], cmd);
        assert.deepEqual(mdFlags(cmd + '\n'), [], cmd);
    }
});

// gh api writes name the repository in the endpoint, not in --repo.
test('gh api: a write outside repos/Danathar/exult is judged', () => {
    for (const cmd of [
        'gh api -X POST repos/exult/exult/issues -f title=x',
        'gh api repos/exult/exult/issues -f title=x',
        'gh api --method PATCH repos/exult/exult/issues/5 -f state=closed',
        'gh api --method=DELETE repos/exult/exult/git/refs/heads/x',
        'gh api -XPUT repos/octocat/other-repo/subscription',
        'gh api repos/exult/exult/issues/5/comments -F body=@note.md',
        'gh api repos/exult/exult/issues --raw-field title=x',
        'gh api repos/exult/exult/issues --input body.json',
        'gh api -X POST "repos/Danathar/exult-other/issues" -f title=x',
        'gh api -X POST repos/{owner}/{repo}/issues -f title=x',
        'gh api -X POST "repos/$GH_REPO/issues" -f title=x',
        'gh api -X POST user/repos -f name=x',
        'gh api -X PUT /repos/exult/exult/pulls/3/merge',
        'gh api graphql -f query="mutation { addComment(input: {}) { clientMutationId } }"',
        'gh api graphql --input query.json',
    ]) {
        assert.ok(wfFlags(cmd).length > 0, `workflow: ${cmd}`);
        assert.ok(mdFlags(cmd + '\n').length > 0, `markdown: ${cmd}`);
    }
});

test('gh api: reads, and writes to repos/Danathar/exult, pass', () => {
    for (const cmd of [
        'gh api repos/exult/exult/pulls',
        'gh api -X GET repos/exult/exult/issues -f state=open',
        'gh api --method HEAD repos/octocat/other-repo',
        'gh api --method GET --paginate "repos/Danathar/exult/pulls/5/comments"',
        'gh api repos/{owner}/{repo}/pulls --jq .[].number',
        'gh api -X PUT "repos/Danathar/exult/rulesets/$id" --input .github/rulesets/master.json',
        'gh api -X POST repos/Danathar/exult/rulesets --input .github/rulesets/master.json',
        'gh api repos/Danathar/exult/issues/5/comments -f body=x',
        "gh api graphql -f query='query { viewer { login } }'",
        'id=$(gh api repos/exult/exult/rulesets --jq \'.[] | select(.name=="x") | .id\')',
    ]) {
        assert.deepEqual(wfFlags(cmd), [], `workflow: ${cmd}`);
        assert.deepEqual(mdFlags(cmd + '\n'), [], `markdown: ${cmd}`);
    }
    assert.deepEqual(wfFlags('gh api -X POST "repos/${{ github.repository }}/issues" -f title=x'), []);
});

test('gh api: each call on a line is judged on its own endpoint', () => {
    const v = wfFlags('gh api repos/Danathar/exult/issues -f title=x && gh api -X POST repos/exult/exult/issues -f title=x');
    assert.equal(v.length, 1);
    assert.match(v[0], /writes to "repos\/exult\/exult\/issues"/);
    assert.deepEqual(mdFlags('Read with `gh api repos/exult/exult/pulls`, never write with it.\n'), []);
});

test('gh issue transfer: the destination repository is judged', () => {
    for (const cmd of [
        'gh issue transfer 5 exult/exult --repo Danathar/exult',
        'gh issue transfer --repo Danathar/exult 5 exult/exult',
        'gh -R Danathar/exult issue transfer 5 octocat/other-repo',
        'gh issue transfer 5 --repo Danathar/exult',
    ]) {
        assert.ok(wfFlags(cmd).length > 0, `workflow: ${cmd}`);
        assert.ok(mdFlags(cmd + '\n').length > 0, `markdown: ${cmd}`);
    }
    const v = wfFlags('gh issue transfer 5 exult/exult --repo Danathar/exult');
    assert.equal(v.length, 1);
    assert.match(v[0], /moves the issue to "exult\/exult"/);
    for (const cmd of ['gh issue transfer 5 Danathar/exult --repo Danathar/exult', 'gh -R Danathar/exult issue transfer 5 Danathar/exult']) {
        assert.deepEqual(wfFlags(cmd), [], `workflow: ${cmd}`);
        assert.deepEqual(mdFlags(cmd + '\n'), [], `markdown: ${cmd}`);
    }
});

const runFlags = (expr) => checkRunExpressions('w.yml', ["        run: echo '" + expr + "'"], WORKFLOWS);

test('run expressions: toJSON(github.event), toJSON(github) and github.ref are rejected', () => {
    for (const expr of [
        '${{ toJSON(github.event) }}',
        '${{ toJSON(github) }}',
        '${{ toJson( github ) }}',
        "${{ toJSON(github['event']) }}",
        '${{ github.ref }}',
        "${{ github['ref'] }}",
        '${{ GitHub.Ref }}',
    ]) {
        assert.equal(runFlags(expr).length, 1, expr);
    }
});

test('run expressions: safe github context leaves stay allowed', () => {
    for (const expr of [
        '${{ github.ref_type }}',
        '${{ github.event_name }}',
        '${{ github.ref_protected }}',
        '${{ github.sha }}',
        '${{ github.repository }}',
        '${{ github.event.pull_request.number }}',
        '${{ toJSON(job) }}',
        '${{ toJSON(steps) }}',
    ]) {
        assert.deepEqual(runFlags(expr), [], expr);
    }
});

function gitFixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-policies-link-'));
    assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
    fs.mkdirSync(path.join(dir, 'd'));
    fs.writeFileSync(path.join(dir, 'd/f.txt'), 'x\n');
    fs.writeFileSync(path.join(dir, 'real.txt'), 'plain\n');
    fs.symlinkSync('d', path.join(dir, 'dirlink'));
    fs.symlinkSync('real.txt', path.join(dir, 'filelink'));
    fs.symlinkSync('missing', path.join(dir, 'dangling'));
    assert.equal(spawnSync('git', ['-C', dir, 'add', '-A']).status, 0);
    return dir;
}

test('listFiles: a tracked symlink to a directory or a dangling link is skipped, a link to a file is kept', () => {
    const dir = gitFixture();
    try {
        assert.deepEqual(listFiles(dir), ['d/f.txt', 'filelink', 'real.txt']);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('secret scan: a tracked symlink to a directory no longer crashes with EISDIR', () => {
    const dir = gitFixture();
    try {
        assert.deepEqual(checkSecretScan(dir, CREDENTIALS.secretScan, listFiles(dir)), []);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
