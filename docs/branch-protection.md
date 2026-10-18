# Branch protection and serialized merging

This page says what protects `master` in `Danathar/exult`, why, and how to
check that GitHub is really enforcing it. Every command here targets
`Danathar/exult`, never the upstream `exult/exult`; see [AGENTS.md](../AGENTS.md).

## What is enforced

The ruleset in [`.github/rulesets/master.json`](../.github/rulesets/master.json)
is applied to the repository as the live ruleset `protect master` (id
`25350776`, applied 2026-10-18). It targets the default branch (`master`) and
has four rules:

| rule | effect |
|---|---|
| `deletion` | `master` cannot be deleted. |
| `non_fast_forward` | no force pushes to `master`. |
| `pull_request` | every change reaches `master` through a pull request. No approving review is required (`required_approving_review_count: 0`) and code owner review is **not** required, so the owner can merge their own PRs and Hive can merge its own. `.github/CODEOWNERS` therefore only *requests* the owner's review on Tier 3 paths ([risk-tiers.md](risk-tiers.md)). |
| `required_status_checks` | the six checks below must pass, on a branch that is up to date with `master` (`strict_required_status_checks_policy: true`). |

Required checks (job names; do not rename these jobs):

| check | workflow |
|---|---|
| `Unit tests (gcc)` | `.github/workflows/ci.yml` |
| `Unit tests (clang)` | `.github/workflows/ci.yml` |
| `E2E (tools)` | `.github/workflows/ci.yml` |
| `Coverage gate` | `.github/workflows/coverage-gate.yml` |
| `agent-tooling` | `.github/workflows/agent-tooling.yml` |
| `policy-check` | `.github/workflows/policy-check.yml` |

All six workflows run on every pull request and every push to `master` with no
path filter, so a docs-only PR still reports them. The upstream `ci-*.yml`
platform builds are **not** required: they are path-filtered (they skip
`docs/**`, `*.md` and more), and a required check that never reports would
block every docs PR forever. They still run on code changes, and a red one
should be treated as a blocker by whoever merges.

`bypass_actors` is empty: nobody, including the owner, can skip these rules
without editing the ruleset.

## Serialized merging (ACMM merge queue, issue #39)

GitHub's merge queue is only available to organization-owned repositories, and
this one is owned by a personal account. Hive's serialized merge lane replaces
it: the repository's Hive `merge_strategy` is `hive-serialized`, so Hive merges
one pull request at a time, after its required checks pass against the current
`master`. The strict up-to-date rule above makes GitHub enforce the same
property for any merge, including the owner's: a PR whose branch is behind
`master` has to be updated and re-checked first:
`gh pr update-branch <N> --repo Danathar/exult`.

The Hive setting lives in Hive, not in this repository; the owner reads and
changes it on the Hive dashboard (ACMM evaluation, Merge queue row) or via
`POST /api/repos/merge-strategy`. Hive's ACMM check credits the criterion when
the strategy is `hive-serialized` **and** the default branch has at least one
required check, which this ruleset provides.

## Checking it

Neither call needs admin rights:

```bash
gh api repos/Danathar/exult/branches/master --jq .protected
gh api repos/Danathar/exult/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'
```

The first prints `true`; the second lists `protect master` as `active`.
Being active does not prove the rules are the ones in the file (an edit in the
GitHub UI could leave only `deletion`). Compare the live ruleset with the file;
the command prints nothing when they match:

```bash
id=$(gh api repos/Danathar/exult/rulesets --jq '.[] | select(.name=="protect master") | .id')
diff <(gh api "repos/Danathar/exult/rulesets/$id" \
         --jq '{name,target,enforcement,conditions,rules}' | jq -S .) \
     <(jq -S '{name,target,enforcement,conditions,rules}' .github/rulesets/master.json)
```

GitHub returns `bypass_actors` only to a repository admin, so the comparison
leaves that field out; the owner can add it to both field lists. The nightly
compliance workflow (`.github/workflows/nightly-compliance.yml`) runs the same
comparison when the repository secret `RULESET_READ_TOKEN` is set (the
workflow `GITHUB_TOKEN` cannot read rulesets) and skips it with a notice
otherwise.

## Applying or changing the ruleset

Only the owner changes the ruleset, and the file and the live ruleset change
together. After a reviewed PR changes `.github/rulesets/master.json` merges:

```bash
id=$(gh api repos/Danathar/exult/rulesets --jq '.[] | select(.name=="protect master") | .id')
gh api -X PUT "repos/Danathar/exult/rulesets/$id" --input .github/rulesets/master.json
```

To create it from scratch (for example after it was deleted):

```bash
gh api -X POST repos/Danathar/exult/rulesets --input .github/rulesets/master.json
```

Then run the comparison above. The file spells out parameters GitHub would
otherwise fill in with defaults, so the diff stays empty.

Removing or renaming a required job needs the live ruleset changed **before**
the PR merges: the PR's own run no longer reports the old name, so with the old
ruleset live it can never merge, and every other open PR would also wait for a
status that never arrives. Order: change the job and
`.github/rulesets/master.json` in one PR; once its other checks are green, the
owner PUTs that PR's ruleset file (command above, run from the PR branch);
then merge, update the other open PRs (`gh pr update-branch <N> --repo Danathar/exult`)
and run the comparison above on `master`.
