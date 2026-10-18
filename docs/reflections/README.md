# Reflections

A reflection is a dated, short account of how a piece of work in this
repository actually went, and what to do differently next time. It is for
patterns in the work itself, not for facts about the code. Together with
[.claude/memory/](../../.claude/memory/README.md) it is the cross-session
knowledge of the repository: what one session learned should not have to be
rediscovered by the next.

Pull requests and issues go to `Danathar/exult` (`--repo Danathar/exult`).

## Where things go

| Place | Holds | Lifetime |
|---|---|---|
| [AGENTS.md](../../AGENTS.md) | standing rules | durable |
| [.claude/memory/](../../.claude/memory/README.md) | one specific mistake and its rule | until no longer true |
| [.claude/session-summary.md](../../.claude/session-summary.md) | what is in flight now | overwritten each session |
| this directory | recurring patterns in how the work goes | dated, kept |

Example of the split: "`gh` resolves this fork to upstream" is a correction
(memory). "New files under a gitignored directory vanish from the commit unless
you check status before pushing" is the kind of pattern a reflection records.

## When to write one

- After a PR where review or CI found something the author's own checks missed.
- After an incident, a revert, or a surprise during a rollout.
- When the same kind of problem has come up twice.

Do not write one for routine work that went as planned.

## Format

File name `YYYY-MM-DD-<topic>.md`:

```markdown
# <title>

**Date:** YYYY-MM-DD
**Context:** which PRs/issues/commits this is about

## What happened
Observed events only, each with a PR, commit or file reference.

## What it shows
The pattern, stated as narrowly as the evidence allows.

## What to do next time
Concrete practices. If one hardens into a standing rule, move it to AGENTS.md.
```

Rules: no event that cannot be traced to a PR, commit or file; mark guesses as
`[INFERENCE]`; delete or amend an entry that later proves wrong. A specific
do/don't also becomes a correction in `.claude/memory/`. PRs and issues in other
repositories are written `Owner/repo#N`.

## Index

| Entry | Subject |
|---|---|
| [2026-10-18-acmm-bootstrap](2026-10-18-acmm-bootstrap.md) | Setting up the agent-instruction set for the ACMM gap issues |
