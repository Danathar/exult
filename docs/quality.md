# Quality dashboard

Which quality signals `Danathar/exult` has, where to look at each, and how to
read them. There is no hosted dashboard: the signals are GitHub Actions runs
and committed files, and this page is the index. Runs are at
<https://github.com/Danathar/exult/actions>. Several signals arrive in separate
ACMM pull requests; until all have merged, some links below point at files not
yet on `master` (the table says which PR owns each). No counts or percentages
are copied here so nothing goes stale; read the live value with the commands
under "Where to look".

## Signals

| signal | where it lives | what it tells you | blocks merge |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` (workflow `CI`), jobs `Unit tests (gcc)`, `Unit tests (clang)`, `E2E (tools)` (tests PR) | unit tests built with gcc and clang (`tests/run-unit-tests.sh`) and end-to-end checks of the tools (`tests/e2e/run.sh`). Runs on every PR and push to `master` | intended required checks |
| Coverage gate | `.github/workflows/coverage-gate.yml`, job `Coverage gate` (tests PR) | test coverage has not dropped below the recorded floor | intended required check |
| upstream platform matrix | upstream `ci-linux.yml`, `ci-macos.yml`, `ci-windows.yml`, `ci-msvc.yml`, `ci-android.yml`, `ci-ios.yml`, `ci-freebsd.yml`, `ci-omnios.yml` | the engine still builds on each platform. They are path-filtered: they skip docs-only and `*.md` changes, so a docs PR shows none of them | not decided here (see the ruleset PR / [branch-protection.md](branch-protection.md) once it exists) |
| format-check | `.github/workflows/format-check.yml` | clang-format 19 diff on every PR; `continue-on-error`, so informational only | no |
| agent-tooling | `.github/workflows/agent-tooling.yml`, job `agent-tooling` (agent-safety PR) | `node --test` of the command-gate hook tests and of `scripts/tests/*.test.mjs` | intended required check |
| policy-check | `.github/workflows/policy-check.yml`, job `policy-check`, `scripts/check-policies.mjs`, `policies/` (agent-safety PR) | machine-checkable repo policies (workflow permissions, `--repo` on documented `gh` writes, and so on) | intended required check |
| PR metrics | `.github/workflows/pr-metrics.yml`, [metrics.md](metrics.md), [metrics/](metrics/README.md) | acceptance rate and time to merge by author class | no, report only |
| auto-QA, agent audit, nightly compliance | `.github/workflows/auto-qa.yml`, `agent-audit.yml`, `nightly-compliance.yml` (automation PR) | scheduled hygiene reports; read each file's header | no |
| upstream-only | `codeql.yml`, `coverity-scan.yml`, `snapshots*.yml` | disabled in this fork | n/a |

Which jobs the ruleset on `master` actually requires is read from GitHub, not
from this page:

```bash
gh api repos/Danathar/exult/rulesets
```

## How to read a red signal

- **`Unit tests (gcc)` red, `(clang)` green** (or reverse): a compiler
  difference: warnings-as-errors, undefined behaviour, or a header not
  included. Fix the code; do not special-case one compiler.
- **`E2E (tools)`**: a tool (`ucc`, `expack`, `ipack`...) built but behaved
  differently. Rerun once; if it passes on the same commit, note a flake.
- **`Coverage gate`**: coverage fell. Add the missing test; lowering the floor
  needs the owner.
- **upstream `ci-*`**: open the failing job's log. Distinguish a real compile
  error from a dependency download failure (SDL3 or package mirrors); the
  second is a rerun, the first is a fix. See the
  [runbook](ai-ops-runbook.md#failed-ci-triage-for-c-builds).
- **`format-check`**: informational; fix only lines you changed.
- **`agent-tooling` / `policy-check`**: treat as a boundary regression until
  proven otherwise.
- **Green on a stale branch** says little; check the branch is current with
  `master`.

## Where to look

```bash
gh run list --repo Danathar/exult --workflow ci.yml --limit 10
gh run view <run-id> --repo Danathar/exult --log-failed
gh pr checks <pr-number> --repo Danathar/exult
gh pr list --repo Danathar/exult --state all --limit 500 \
  --json number,author,state,createdAt,mergedAt,closedAt,labels,title \
  | node scripts/pr-metrics.mjs
tests/run-unit-tests.sh && tests/e2e/run.sh
```

## Known weak spots

- **Gameplay is not tested in CI.** The engine needs the copyrighted Ultima VII
  data, which cannot be in the repository, so no job plays BG or SI. Rendering,
  audio, usecode against real game scripts and savegame loading of real saves
  are checked only by the owner by hand.
- **Path filters hide platform builds from docs PRs**, and docs-only PRs get
  none of the upstream matrix. That is intended, but means those builds are
  exercised only by code PRs.
- **Coverage is a floor, not a target**, and measures lines run, not behaviour.
- **Acceptance rate needs an independent decider**; see
  [metrics.md](metrics.md#how-to-read-the-numbers). The first reading
  ([metrics/2026-10-18.md](metrics/2026-10-18.md)) had no PRs at all.
