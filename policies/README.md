# Policies as code

JSON policies that `node scripts/check-policies.mjs` evaluates against the
repository tree. The `policy-check` workflow
([`.github/workflows/policy-check.yml`](../.github/workflows/policy-check.yml))
runs it on every pull request and push to `master`. Tests are in
[`scripts/tests/check-policies.test.mjs`](../scripts/tests/check-policies.test.mjs)
(`node --test scripts/tests/check-policies.test.mjs`); each policy has a test
that the real tree passes and tests that a mutated copy fails.

Changing a policy is a Tier 3 change in [docs/risk-tiers.md](../docs/risk-tiers.md)
and needs the owner. Why these policies exist, and what the script does and does
not defend against, is in
[docs/security/SECURITY-AI.md](../docs/security/SECURITY-AI.md).

## Scope: upstream files

This is a fork. The checker runs over the whole tree, so every policy is either
true of the upstream files as they are, or scoped away from them:

- `repo-target`, `credential-safety` and `game-data` hold for the upstream files
  unchanged (checked on every run).
- `workflow-permissions` does **not** hold for the upstream workflows (no
  top-level `permissions:`, unpinned actions), so its `excludeGlobs` lists them:
  `ci-*.yml`, `codeql.yml`, `coverity-scan.yml`, `format-check.yml`,
  `notify.yml`, `released.yml`, `snapshots*.yml`. Every other workflow under
  `.github/workflows/` is a fork addition and is checked. A new upstream
  workflow would be checked too, and fail until it is added to the list.

## repo-target.json

Stops agent instructions from sending work to the upstream project.

- Every file that exists and matches `directionGlobs` must contain the literal
  `--repo Danathar/exult`. Globs for files that do not exist are ignored.
- In those files and in the Markdown under `scanGlobs`, each
  `gh pr|issue|release|workflow|label` write command (`create`, `comment`,
  `edit`, `close`, `reopen`, `merge`, `review`, `delete`, `run`, and the others
  in `writeCommandPattern`) and the `rerun`, `cancel` and `delete` verbs of
  `gh run` must carry `--repo Danathar/exult`, or `-R Danathar/exult`, on the
  same logical line (an environment variable is not enough in Markdown). A
  command continued with a trailing backslash is one line. There is no
  exemption for prose: describe an unscoped command in words, or add the flag.
- No scanned line may pass `--repo`/`-R` for another repository to a `gh` write
  command, set `GH_REPO=` to another repository, or run `gh repo set-default`
  for another repository. Read-only links to other repositories are allowed.

## workflow-permissions.json

For every fork-added `.github/workflows/*.yml` (see "Scope"):

- a top-level `permissions:` block is present and grants no write (`write-all`
  or `<scope>: write` is rejected; grant write on the job that needs it);
- `pull_request_target` is not used;
- every `uses:` outside `actions/` and `github/` is pinned to a 40-character
  commit SHA (keep the tag in a trailing `# vX` comment); local `./` and
  `docker://` references are skipped;
- every logical line that runs a `gh` write command passes `--repo`/`-R` with
  `Danathar/exult` or `${{ github.repository }}`. `GH_REPO` (in `env:` or
  before the command) never substitutes for the flag; a `GH_REPO` naming another
  repository, or any other `--repo` value, fails;
- `run:` scripts contain no attacker-controlled expression such as
  `${{ github.event.issue.title }}`, `github.head_ref` or `inputs.*`; pass it
  through `env:` and read `"$VAR"`. Numbers, SHAs and
  `github.event.repository.name` are allowed.

## agent-guardrails.json

`.claude/settings.json` must keep denying `sudo`, force pushes, `make install`,
`git remote add` and the `gh` PR merge command, and keep the Bash `PreToolUse` hook that
runs `guard-bash.mjs`; `.claude/hooks/guard-bash.mjs` must keep pinning
`danathar/exult` and refusing pushes to any remote but `origin`. This proves the
rules were not deleted, not that they work; the tests in `.claude/hooks/tests/`
do that.

## credential-safety.json

`secretScan` over every text file (binary files and files over 1 MB are skipped,
and so is this policy file, which holds the patterns): no GitHub token, LLM API
key, AWS key ID, private-key block or Discord webhook URL. A hit is reported by
file, line and kind, never by value. Build fake secrets in tests at run time
(concatenation) so the test file itself stays clean.

## game-data.json

No tracked file under `gamedat/` or the repository-root `static/`, no `*.sav`,
`u7speech.spc` or `u7voice.flx` (case-insensitive). Data Exult ships itself
(`content/`, `data/`) does not match.

## CODEOWNERS and risk tiers

Not JSON policy files. The checker compares the tier table in
[docs/risk-tiers.md](../docs/risk-tiers.md) with
[`risk-config.json`](../risk-config.json) and fails when tier numbers, names,
paths, required commands or review values differ (a literal `|` in a command is
written `\|` in the table). It also fails when a path in a tier whose review is
`owner` has no entry for `owner` in [`.github/CODEOWNERS`](../.github/CODEOWNERS),
when a later CODEOWNERS entry takes such a file off the owner, or when
CODEOWNERS has a catch-all `*` entry. `**/x` in the config is `x` in
CODEOWNERS, `dir/**` is `/dir/`, anything else is `/path`.
`node scripts/check-policies.mjs --classify <path>...` prints the tier of a path.
It cannot see inside a file, so it does not apply the "Raise the tier" rules.

## What the checker does not do

It catches accidental omissions: an agent-direction file or workflow that
forgets `--repo Danathar/exult`, a missing `permissions:` block, an unpinned
action, an event expression interpolated into a script, a committed token or
game-data path. It is not a shell or YAML parser and does not defend against
deliberately obfuscated commands. The hard boundaries are the repository-scoped
`GITHUB_TOKEN`, the branch ruleset on `master` (pull request plus six required
status checks, see `docs/branch-protection.md`) and the owner's merge. The
ruleset does not require code owner review, so CODEOWNERS only requests the
owner's review.
