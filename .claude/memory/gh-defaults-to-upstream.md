# gh defaults to the upstream repository

**Date:** 2026-10-18
**Wrong:** running `gh pr create`, `gh issue create` or `gh issue comment`
without `--repo`, assuming it targets this fork.
**Right:** `Danathar/exult` is a fork of `exult/exult`, and `gh` can pick the
parent as the default repository for a fork clone that has no default set. The
default is per clone (`gh repo set-default --view`), so do not rely on it:
always pass `--repo Danathar/exult` on writes; PRs use
`gh pr create --repo Danathar/exult --base master --head <branch>`.
**Why it matters:** a PR or comment could land on the upstream project, which
the owner has not authorised.
**Evidence:** `gh repo view Danathar/exult --json isFork,parent` shows the fork
relationship (2026-10-18); the fallback behaviour itself was not reproduced
here. Fork rule in [AGENTS.md](../../AGENTS.md).
