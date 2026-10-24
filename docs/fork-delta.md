# Fork delta: engine changes this fork carries

`Danathar/exult` is a fork of `exult/exult`. Most of what the fork adds lives in
files upstream does not have: `tests/`, `scripts/`, `.claude/`, `.cursor/`,
`policies/`, root files such as `AGENTS.md`, and the files the fork added under
`docs/` and `.github/`. This page, with one file per change in
[`fork-delta/`](fork-delta/), lists the other kind of change: edits to
**upstream-owned files** (engine, tools, build files), merged into `master` and
carried on top of upstream. A file is upstream-owned when `exult/exult` has it,
wherever it lives: `docs/` and `.github/` hold upstream files too, such as
`docs/Makefile.am`.

It exists for two jobs:

- **Syncing from upstream.** A conflict inside an engine file is resolved
  against its entry here. See
  [`sync-from-upstream`](../.claude/skills/sync-from-upstream/SKILL.md).
- **Sending fixes upstream.** The entries with status `not reported` are the
  candidates for the owner to send to `exult/exult` by hand. See
  [CONTRIBUTING](../CONTRIBUTING.md).

## Keeping it current

Each change has its own file in [`fork-delta/`](fork-delta/), named after its
PR number (`305.md`). A table that every PR appended to put all open PRs into
conflict whenever one of them merged; separate files do not.

- **Add a file** in the same pull request that changes an upstream-owned file.
  A PR that touches only files upstream does not have adds nothing. Name it
  `<PR number>.md`; if the PR is not open yet, use the branch name with `/`
  replaced by `-`, and rename it once the number is known. Entries for the PRs
  that merged before they had to add one (#185 to #218) were backfilled from
  `git log`.
- **Format.** A heading linking the PR (or PRs, when a later one extends the
  same fix), then three bullets: **Files** (backticked paths), **Reason** and
  **Upstream status**. Copy an existing file.
- **Upstream status** is one of `not reported`, `reported <link>`, or
  `fixed upstream in <commit>`.
- **Delete the file** at sync time once upstream fixed the same bug and the
  sync took upstream's version (status `fixed upstream in <commit>`).
- Keep the reason to one line; the PR holds the detail.

To find the entry for a file, search the folder: `grep -l 'files/utils.cc'
docs/fork-delta/*.md`. To read them all: `cat docs/fork-delta/*.md`.
