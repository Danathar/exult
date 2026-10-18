# gh defaults to the upstream repository

**Date:** 2026-10-18
**Wrong:** running `gh` commands that create or comment on PRs or issues
without the repo flag, assuming they target this fork.
**Right:** `Danathar/exult` is a fork of `exult/exult`, and `gh` picks its
target from the clone's remotes and a per-clone default
(`gh repo set-default --view`), and that default can be the parent (for example
after `gh repo clone` of a fork). Do not rely on it:
always pass `--repo Danathar/exult` on writes; PRs use
`gh pr create --repo Danathar/exult --base master --head <branch>`.
**Why it matters:** a PR or comment could land on the upstream project, which
the owner has not authorised.
**Evidence:** `gh repo view Danathar/exult --json isFork,parent` shows the fork
relationship (2026-10-18); the fallback behaviour itself was not reproduced
here. Fork rule in [AGENTS.md](../../AGENTS.md).
