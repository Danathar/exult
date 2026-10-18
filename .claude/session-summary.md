# Session summary

The handoff between working sessions. Read it at the start of a session, after
[AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md); rewrite it at the end.
It carries only what is true right now and would otherwise have to be
rediscovered. Standing rules belong in AGENTS.md, mistakes worth never
repeating in [memory/](memory/README.md), recurring patterns in
[../docs/reflections/](../docs/reflections/README.md).

GitHub writes pass `--repo Danathar/exult`; never act on `exult/exult`.

## How to use it

Start of session:

1. Read "Current state" and the latest session entry below.
2. Verify anything you are about to rely on. Branch names, PR numbers and SHAs
   drift: check with `git log origin/master`,
   `gh pr list --repo Danathar/exult` and `gh issue list --repo Danathar/exult`.

End of session. This is one tracked file, so concurrent PRs that all rewrite it
conflict. Rule: only the session that lands work on `master` (or a dedicated
handoff PR opened after the merge) rewrites it, starting from the current
`origin/master` copy. A session that opens a PR to be merged later puts its
notes in the PR body and leaves this file alone. The session that updates it:

1. Updates "Current state" to match `master` now.
2. Replaces the "Last session" entry (overwrite; do not append a history).
   What is worth keeping goes to AGENTS.md, `memory/` or `docs/reflections/`.
3. Rewrites "Open threads" and "Next steps", one line each with an issue or PR
   number.
4. Records only observed things; marks guesses `[INFERENCE]`.

Entry format:

```markdown
## Last session: <YYYY-MM-DD> - <one-line focus>

**Done:** what landed, with PR/issue numbers
**In flight:** open PRs, unmerged branches, half-finished work
**Blocked on:** decisions or merges needed before the next step
**Watch:** observed but not acted on
```

---

## Current state (as of 2026-10-18)

- **What the repo is:** `Danathar/exult`, a fork of `exult/exult` (GPL, C++17,
  autotools Ultima VII engine plus Exult Studio and command-line tools).
  Default branch `master`. Merges are done by the owner's Hive one PR at a
  time (`hive-serialized`).
- **ACMM rollout in progress:** the Hive ACMM evaluation filed gap issues
  (labels `acmm`, `ai-fix-requested`). They are being closed by five slice PRs
  (tests/CI, agent instructions, agent safety, contributor docs, automation),
  plus a later ruleset change by the owner. This file and the rest of the
  agent-instruction set come from the agent-instructions slice.
- **Checks:** the entry points `tests/run-unit-tests.sh` and
  `tests/e2e/run.sh` come from the tests/CI slice; until it merges they may be
  absent. The upstream `ci-*` build workflows are path-filtered.

## Last session: 2026-10-18 - ACMM bootstrap, agent-instructions slice

**Done:** wrote AGENTS.md, CLAUDE.md, Copilot and Cursor entry points,
`.editorconfig`, the prompt catalog, skills, memory entries, this file and the
first reflection, in one PR to `Danathar/exult`.
**In flight:** the other four slice PRs; the branch ruleset (owner).
**Blocked on:** the owner merging the slice PRs and re-running the ACMM
evaluation.
**Watch:** AGENTS.md cites paths owned by other slices (`tests/`,
`docs/risk-tiers.md`, `docs/review-rubric.md`, `CONTRIBUTING.md`); confirm they
exist once those PRs merge.

## Open threads

- ACMM gap issues on `Danathar/exult`: close as each slice PR merges.

## Next steps

1. Owner merges the slice PRs one at a time.
2. Owner applies the master ruleset with the required checks.
3. Re-run the ACMM evaluation.
