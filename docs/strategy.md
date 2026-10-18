# Strategy

Why `Danathar/exult` exists, what it will not do, what puts it at risk, which
goals are measured and where, and what the first reading said. Written
modestly: this is a personal fork, not a product roadmap. Agent rules are in
[AGENTS.md](../AGENTS.md); how agents share the repository is in
[multi-agent.md](multi-agent.md).

## Why this fork exists

- Upstream [Exult](https://github.com/exult/exult) is a C++17 engine that runs
  Ultima VII (Black Gate and Serpent Isle) on modern systems, with Exult
  Studio, the `ucc` usecode compiler and asset tools (`expack`, `ipack`,
  `shp2pcx`, `splitshp`). The engine needs the player's own copy of the games.
- The fork is the owner's place to try changes, and to try managing a large
  existing C++ codebase with AI agents (the owner's Hive system) under
  guardrails, with the human owner deciding what lands. It does not replace
  upstream; upstream changes come in when the owner syncs them.
- Licence: GPL-2.0-or-later ([COPYING](../COPYING)).

## What it will not do

- Contain Ultima VII game data or other copyrighted assets.
- Open issues or PRs on upstream from agent work.
- Let an agent merge its own PR or widen its own permissions.
- Change savegame or data-file formats casually.

## Real risks, in order

1. **Savegame and data-file compatibility.** Silent corruption of years-old saves.
2. **Cross-platform breakage.** The engine ships on eight upstream CI platforms; a
   Linux-only check can pass while Windows or Android fails.
3. **Memory safety.** Engine code parses game files and runs usecode; bad data
   must not turn into out-of-bounds access.
4. **Fork drift.** The longer the fork diverges, the harder syncing upstream gets.
5. **Agent overreach**: agents are new to this repository; see
   [agent-boundaries.md](agent-boundaries.md).

## Goals and where they are measured

| goal | measured by | where |
|---|---|---|
| Reach and hold the target ACMM level | open `acmm`-labelled issues | `gh issue list --repo Danathar/exult --label acmm --state open` |
| `master` stays green | `CI` and the upstream `ci-*` jobs on pushes | `gh run list --repo Danathar/exult --branch master --limit 10` |
| Tests exist and do not regress | `tests/`, `Coverage gate` | [quality.md](quality.md) |
| Change flow is visible | PR counts and times | [metrics.md](metrics.md), [metrics/](metrics/README.md) |
| Agent work is traceable | `Closes #N` on every PR and a ledger | [agent-tasks/](agent-tasks/README.md) |

None is a velocity target.

## Autonomy roadmap

Honest and incremental; each step needs the previous one to hold.

1. **Now (bootstrap, 2026-10):** agents open PRs for ACMM issues; the owner
   reads and merges them (or Hive's serialized lane merges after checks).
2. **Next:** the required-check set and ruleset are applied by the owner
   (issue #39); agents get small, well-specified issues in Tier 1 and Tier 2
   paths.
3. **Later, only if the numbers justify it:** wider agent autonomy for Tier 2,
   judged by the PR metrics and review outcomes. Tier 3 stays human-reviewed.
   There is no date for this; the metrics are too thin to decide anything yet.

## Status on 2026-10-18

| measure | reading | how |
|---|---|---|
| PR history | none yet | [metrics/2026-10-18.md](metrics/2026-10-18.md) |
| Tests | no fork-owned test suite on `master` at this date; the tests PR adds one | `git ls-tree master tests/` |
| ACMM | open gap issues #1 to #47 (the issue list says what remains) | `gh issue list --repo Danathar/exult --state open` |

This is a dated reading, left as read. The next reading is a new section.
