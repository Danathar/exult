---
name: sync-from-upstream
description: Owner-only guidance for bringing upstream exult/exult changes into the Danathar/exult fork. Agents do not run this on their own.
---

# sync-from-upstream (owner only)

Syncing the fork with upstream `exult/exult` is the owner's job. An agent
must not add an upstream remote, push to `master`, or open anything on
`exult/exult`. If you are asked to port one upstream change, use
`.github/prompts/port-upstream-commit.prompt.md` and open a normal PR to
`Danathar/exult`.

For the owner, one way to do it (check each command against your own setup;
this skill has not been exercised by an agent):

1. Make sure no ACMM or Hive PRs are mid-merge: Hive merges serially.
2. Use GitHub's "Sync fork" on `Danathar/exult`, or locally fetch upstream
   with a temporary remote and merge it on a branch, not directly on `master`.
3. Expect conflicts only where this fork added files: `.github/`, `.claude/`,
   `.cursor/`, `AGENTS.md`, `CLAUDE.md`, `.editorconfig`, `docs/`, `tests/`,
   `scripts/`, `policies/`. Upstream does not use those names today, but check.
4. Run `tests/run-unit-tests.sh` and `tests/e2e/run.sh`, and let the `ci-*`
   workflows run, before merging the sync PR.
5. Remove the temporary remote afterwards; the clones are expected to have only
   `origin`.
