# ACMM bootstrap: agent instructions for the fork

**Date:** 2026-10-18
**Context:** `Danathar/exult` issues #7-#14, #21, #30, #35, #44 and #46 (agent
instruction files, EditorConfig, prompts, skills, correction capture, session
summary, cross-session knowledge, reflection log), done as one slice of a
five-slice rollout.

## What happened

- The Hive ACMM evaluation filed gap issues that check only for file existence.
  The work was split by file ownership so five slices could proceed in parallel
  without touching each other's files.
- `.gitignore` contains the entry `.github`; a slice peer reported it before
  any file under `.github/` had been committed, so new files there are added
  with `git add -f`.
- A prompt catalog README was first written to the repository root by mistake
  because the shell tool's `cd` does not work; the root `README.md` was
  restored with `git checkout` and the file moved before anything was
  committed.
- `.editorconfig` was derived from measurement, not convention: of 574 `.cc`
  and `.h` files, 548 start lines with a tab, 4 `.uc` files use CRLF, and
  several files have no final newline. The file therefore sets indentation but
  not line endings, charset, final newline or trailing whitespace.
- The agent docs cite paths other slices create (`tests/`,
  `docs/risk-tiers.md`, `docs/review-rubric.md`); the docs say so rather than
  claiming they exist.

## What it shows

- Rules that a checker or a formatter does not enforce should be derived from
  what the tree actually does, or they will flag existing files.
- Ignored directories fail silently; the staging check must be explicit.
- When docs cite files from other PRs, the dependency should be stated in the
  doc and in the session summary.

## What to do next time

- Run `git status --ignored --short` before committing.
- Use `cwd` for the shell tool, never `cd`, and check `git status` after
  writing files with relative paths.
- After the slice PRs merge, verify that every cited path exists.
