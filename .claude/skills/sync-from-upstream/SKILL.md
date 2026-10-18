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
2. Locally fetch upstream with a temporary remote and merge it on a branch,
   then open a PR to `Danathar/exult`. Avoid GitHub's "Sync fork" button: it
   updates `master` directly and bypasses the PR and its checks.
3. Expect conflicts mainly where this fork added files: `.claude/`, `.cursor/`,
   `AGENTS.md`, `CLAUDE.md`, `.editorconfig`, `tests/`, `scripts/`,
   `policies/`. Upstream also has `.github/` and `docs/`, so check those too.
4. Run `tests/run-unit-tests.sh` and `tests/e2e/run.sh`, and let the `ci-*`
   workflows run, before merging the sync PR.
5. Any `gh` write command passes `--repo Danathar/exult`.
6. Remove the temporary remote afterwards; the clones are expected to have only
   `origin`.
