# gh defaults to the upstream repository

**Date:** 2026-10-18
**Wrong:** running `gh pr create`, `gh issue create` or `gh issue comment`
without `--repo`, assuming it targets this fork.
**Right:** `Danathar/exult` is a fork (`gh repo view Danathar/exult --json isFork,parent`
reports `isFork: true`, parent `exult/exult`), and `gh` can resolve a fork to its
parent. Always pass `--repo Danathar/exult`; PRs use
`gh pr create --repo Danathar/exult --base master --head <branch>`.
**Why it matters:** a PR or comment would land on the upstream project, which
the owner has not authorised.
**Evidence:** `gh repo view Danathar/exult --json isFork,parent` (2026-10-18);
fork rule in [AGENTS.md](../../AGENTS.md).
