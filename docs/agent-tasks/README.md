# Agent task traceability

How to start from an agent's change in `Danathar/exult` and find the task that
produced it, and how this directory records that. Rules for agents:
[AGENTS.md](../../AGENTS.md); how agents share the repository:
[multi-agent.md](../multi-agent.md). Every `gh` command passes
`--repo Danathar/exult`.

## What a ledger is

One file per day or session, `YYYY-MM-DD.md` (add `-2` for a second session the
same day). For each task:

| column | meaning |
|---|---|
| issue | the GitHub issue, `#N` |
| branch | the branch used |
| PR | the PR number once one exists; `-` before that. Never guess one |
| outcome | `open`, `merged`, `closed unmerged`, `abandoned`, with a reason if not merged |
| agent | who did it: Hive agent (`agent=<name>` from the signature line), a workflow, or a local session |
| Hive run | link to the Hive run, or `none` |

A ledger records what was planned and what happened that day. Add rows and fill
in PR and outcome as they become known; do not rewrite history; add a dated note
if a later fact contradicts a row.

## Following one change end to end

```text
git blame -> commit --gh api repos/Danathar/exult/commits/<sha>/pulls--> PR
PR --Closes #N--> issue (the task statement)
PR --signature line / author--> agent
issue/branch/PR --this directory--> ledger row
```

- Closing reference:
  `gh pr view <N> --repo Danathar/exult --json closingIssuesReferences --jq '[.closingIssuesReferences[].number]'`
- Hive signature: Hive PRs end with `— hive: agent=<name>` and are opened by
  `app/danathar-atomic-hive`. A PR the owner opened from a local session carries
  the owner's login; do not read "unsigned" as "human-written".
- Branch: `gh pr list --repo Danathar/exult --state all --head <branch> --json number,state,mergedAt`
- The ACMM bootstrap used `acmm/<slice>` branches; Hive names its own.
- `agent-audit.yml` (automation PR) reports agent PRs lacking a closing
  reference, a signature or an acceptable merger. None of these marks is
  enforced for every change; the ledger closes the gap by hand.

## Ledgers

- [2026-10-18](2026-10-18.md): the ACMM bootstrap.
