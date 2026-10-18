# Correction memory

One file per correction: a mistake an agent made, or nearly made, in this
repository, the rule that prevents it, and the evidence. The conversation that
produced a mistake is gone by the next session; these files are what is left.
This is the repository's correction-capture and cross-session knowledge store.

Pull requests, issues and comments go to `Danathar/exult` only
(`--repo Danathar/exult`), and Ultima VII game data is never committed.

## What goes here

- Something an agent got wrong, or came within one step of getting wrong, that
  is easy to repeat and hard to see from the code alone.
- Not here: standing rules for all work ([AGENTS.md](../../AGENTS.md)), what is
  in flight ([../session-summary.md](../session-summary.md)), and patterns in
  how the work goes ([../../docs/reflections/](../../docs/reflections/README.md)).
  A correction that hardens into a standing rule is proposed to the owner for
  AGENTS.md (it is Tier 3, owner-only); the entry stays as the reason behind
  the rule.

## Naming and format

`<kebab-case-topic>.md`, one correction per file:

```markdown
# <short title>

**Date:** YYYY-MM-DD (when it was recorded)
**Wrong:** what was done or assumed
**Right:** what is true / what to do
**Why it matters:** the consequence of repeating it
**Evidence:** file and function/symbol, workflow, command or PR
```

Evidence must be something a reader can open or run. A claim that cannot be
checked does not get an entry. Cite code by function or symbol name, never by
bare line number.

## When to add and retire

- Add an entry in the PR that fixes the mistake, or at the end of the session in
  which it was caught. Check the index first and extend an existing entry
  instead of adding a near-duplicate.
- Re-verify an entry before relying on it. If it is no longer true, delete or
  rewrite it in the PR that makes it untrue.
- Add the new file to the index below.

## Index

| Entry | One line |
|---|---|
| [gh-defaults-to-upstream](gh-defaults-to-upstream.md) | `gh` may target the parent `exult/exult`; always pass `--repo Danathar/exult` on writes |
| [game-data-is-copyrighted](game-data-is-copyrighted.md) | Files copied from an Ultima VII install are never committed, not even as test fixtures |
| [ci-workflows-are-path-filtered](ci-workflows-are-path-filtered.md) | The upstream `ci-*` builds skip docs-only PRs, so a green PR may not have been built |
| [github-dir-is-gitignored](github-dir-is-gitignored.md) | `.gitignore` ignores `.github`, so new files there need `git add -f` |
| [dont-reformat-whole-files](dont-reformat-whole-files.md) | Format only the lines you change; the tree uses tabs and `.clang-format` is informational in CI |
| [generated-files-stay-out](generated-files-stay-out.md) | `ucparse.cc`, `uclex.cc`, `configure` and friends are generated and gitignored |
