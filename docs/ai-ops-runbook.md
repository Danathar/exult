# AI operations runbook

For the owner. How to notice each automated signal in `Danathar/exult`, what to
check first, what to do, and how to stop each automation. Items marked
**(unverified)** were written from documentation or from the reference setup in
another repository and have not been exercised against this repository yet.
Every `gh` command names `--repo Danathar/exult` so it never defaults to the
upstream parent.

| need | section |
|---|---|
| Stop all agent work | [Pause and resume](#pause-and-resume-the-repository-in-hive) |
| Which workflow does what, turn one off | [Workflows](#workflows-and-how-to-turn-them-off) |
| Hive merges one PR at a time | [Serialized merge lane](#serialized-merge-lane) |
| A red build | [Failed CI triage for C++ builds](#failed-ci-triage-for-c-builds) |
| SDL3 fails to build or link | [SDL3 build failures](#sdl3-build-failures) |
| Runner out of space, slow or repeated downloads | [Disk and cache](#disk-and-cache) |
| An agent is looping | [Runaway agent](#runaway-agent) |
| A secret leaked | [Leaked secret](#leaked-secret) |

## Pause and resume the repository in Hive

Hive is outside this repository (a self-hosted dashboard plus the GitHub App
`danathar-atomic-hive`). Its per-repo pause stops agent activity on
`Danathar/exult` only; the card, counts and ACMM evaluation stay.

- Dashboard: on the repo's card press "pause" (it asks for a reason) or
  "resume".
- API: `POST /api/repos/pause` with `{"repo": "exult", "reason": "..."}`,
  `POST /api/repos/resume` with `{"repo": "exult"}`, `GET /api/repos/pauses`;
  owner-only. **(unverified for this repo; taken from Hive's own docs.)**
- Pause does not stop GitHub workflows, local Claude Code or omp sessions, or
  review bots, and does not undo anything already pushed.

Confirm the pause itself in Hive: the dashboard card, or `GET /api/repos/pauses`
(owner-only; **unverified for this instance**). The command below only checks
recent agent activity; it cannot show that a pause is in effect.

```bash
gh pr list --repo Danathar/exult --state all --author app/danathar-atomic-hive --limit 5 --json number,createdAt,title
```

## Workflows and how to turn them off

Disable one without deleting it (reversible):

```bash
gh workflow disable <file>.yml --repo Danathar/exult
gh workflow enable  <file>.yml --repo Danathar/exult
gh workflow list --repo Danathar/exult --all
```

Disabling a required check leaves PRs waiting for a status that never arrives;
relax the ruleset first. Each workflow's header comment is the source of truth,
not this table. Several files arrive in other ACMM PRs and exist on `master`
only after those merge.

| file | what it does |
|---|---|
| `ci.yml`, `coverage-gate.yml` | unit/e2e tests and coverage floor on every PR and push |
| `agent-tooling.yml`, `policy-check.yml` | hook/script tests and repo policy checks |
| `pr-metrics.yml` | weekly and manual; read-only summary plus artifact ([metrics.md](metrics.md)) |
| `auto-qa.yml`, `nightly-compliance.yml`, `agent-audit.yml`, `auto-issues.yml` | scheduled or failure-triggered reports and tracking issues |
| `ai-fix.yml`, `claude.yml` | agent workflows, started by the owner or collaborators by label or `@claude`; skip when no Anthropic credential is configured |
| `labeler.yml` | labels PRs by changed paths |
| upstream `ci-*.yml`, `format-check.yml`, `notify.yml`, `released.yml` | platform builds etc.; do not edit them in fork PRs |
| `codeql.yml`, `coverity-scan.yml`, `snapshots*.yml` | disabled in this fork |

## Serialized merge lane

Hive merges this repository with strategy `hive-serialized`: one PR at a time,
after the required checks pass. GitHub's merge queue is not available to a
personal-account repository. **(unverified here:** the live setting; read it
from the Hive dashboard.) If the lane stalls: look at the PR's checks
(`gh pr checks <N> --repo Danathar/exult`); a PR whose branch is behind
`master` needs updating (`gh pr update-branch <N> --repo Danathar/exult`);
`hold` labels placed by the owner stop the lane for that PR and must not be
removed by an agent.

## Failed CI triage for C++ builds

```bash
gh run list --repo Danathar/exult --branch master --limit 10
gh run view <run-id> --repo Danathar/exult --json jobs \
  --jq '.jobs[] | {name, conclusion, failed: [.steps[] | select(.conclusion=="failure") | .name]}'
gh run view <run-id> --repo Danathar/exult --log-failed
```

1. **Which step failed.** The upstream Linux job's steps are: install
   dependencies, checkout and build SDL3 and SDL_image 3, `autoreconf -v -i`,
   `./configure ...`, `make -j 2`. A failure before `Configure` is
   environmental or dependency; in `Build` it is a compile or link error.
2. **Dependencies versus code.** `apt` mirror errors, a failed `git clone` of
   SDL, or `E: Unable to locate package` are not the PR's fault: rerun once
   (`gh run rerun <run-id> --repo Danathar/exult --failed`).
3. **Compile error.** Find the first `error:` in the log; later errors are
   usually fallout. If gcc passes and clang fails (or the reverse), fix the
   code for both. A header or `std::` function missing on one compiler
   (for example a missing `#include <exception>`) is the usual cause.
4. **Path filters.** The upstream `ci-*` workflows skip docs and `*.md` changes,
   so "no platform build ran" on a docs PR is expected.
5. **Autotools errors** (`configure.ac`, `Makefile.am`): Tier 3; read the PR as
   the owner. Check that every build system listing sources was updated.
6. **Fix forward or revert** by PR (`git revert -m 1 <merge sha>`); never push
   to `master`. Close any auto-opened tracking issue by hand when green.

## SDL3 build failures

Upstream's `ci-linux.yml` builds SDL3 (tag `release-3.2.14`) and SDL_image
(tag `release-3.2.4`) from source on every run; these tags were read from the
file at the time of writing and may change.

- `Install SDL 3` fails: usually missing system development packages (X11,
  Wayland, ALSA) or a network error cloning; rerun, then compare the apt list
  against the SDL README.
- `configure` says SDL3 not found: the `sudo cmake --install` step did not
  put `sdl3.pc` on `PKG_CONFIG_PATH` (look under `/usr/local/lib`); this repo's
  engine needs SDL3 3.2.x, not SDL2.
- Link errors about `SDL_` symbols: a header/library version mismatch, often a
  stale SDL2 development package alongside SDL3.
- Reproduce locally in a container, never on the host's system libraries:
  `podman run --rm -it -v "$PWD":/src:Z debian:13 bash`, install the packages
  from `ci-linux.yml`, build SDL3 as that file does, then
  `autoreconf -v -i && ./configure && make`. **(unverified: package names may
  differ per distro release.)**

## Disk and cache

- Hosted runners are ephemeral; a full disk shows as `No space left on device`
  in the build. The Exult build with `--with-debug=extreme` and Exult Studio is
  large; the fix is a smaller configure line in a PR (Tier 3), not cleaning by
  hand.
- The upstream workflows do not cache the SDL3 builds, so each run recompiles
  them. Adding a cache is a possible Tier 3 improvement, not done.
- Artifacts and logs expire on GitHub's own schedule; the `pr-metrics`
  artifact is kept 90 days.
- Local worktrees and containers (`/var/tmp/exult-acmm/` in the bootstrap) are
  scratch: remove with `git worktree remove` and `podman system prune` when
  done. **(Owner-run, on the owner's machine.)**

## Runaway agent

Signal: many PRs or comments, rewriting the same files, or acting outside its
issue.

1. Pause the repository in Hive; disable `ai-fix.yml` and `claude.yml` if a
   workflow agent is involved.
2. Cancel queued runs: `gh run list --repo Danathar/exult --status in_progress`,
   `gh run cancel <run-id> --repo Danathar/exult`.
3. Close its PRs (`gh pr close <N> --repo Danathar/exult`), keep the branches as
   evidence. Confirm no PR landed unreviewed:
   `gh pr list --repo Danathar/exult --state merged --author app/danathar-atomic-hive --limit 20`.
4. Check it did not open anything on upstream `exult/exult`:
   `gh search prs --author app/danathar-atomic-hive --repo exult/exult`
   **(unverified: search of app authors may not work; also look at the Hive log)**.
5. Find why before resuming: the issue text, [AGENTS.md](../AGENTS.md),
   [agent-boundaries.md](agent-boundaries.md). Fix the instruction, not only
   the output.

## Leaked secret

Signal: a token or key in a commit, PR, issue or log. Secrets that could exist
here: an Anthropic credential for `claude.yml`/`ai-fix.yml` (if the owner added
one), Hive tokens. Nothing in the repository needs one for a normal build.

1. Revoke at the issuer first; history cleanup does not un-leak.
2. Disable the workflows that used it.
3. Remove it from visible surfaces; the owner decides on rewriting branch
   history, never `master` without a plan.
4. Replace it: `gh secret set <NAME> --repo Danathar/exult` (owner-run so the
   value is never in a transcript).
5. Record the event in the day's [ledger](agent-tasks/README.md) without the
   value.
