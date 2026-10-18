# Do not reformat whole files

**Date:** 2026-10-18
**Wrong:** running clang-format or an editor "format on save" with spaces over a
whole file you edit, or converting tabs to spaces.
**Right:** `.clang-format` uses tabs (`UseTab: ForContinuationAndIndentation`,
`TabWidth: 4`, `ColumnLimit: 132`). Format only your changed lines
(`git clang-format` style). `.editorconfig` sets tabs for sources. Past mass
reformats are listed in `.git-blame-ignore-revs`; do not add another.
**Why it matters:** huge diffs hide the real change, break blame and make
upstream ports harder.
**Evidence:** `.clang-format`; `.git-blame-ignore-revs`;
`.github/workflows/format-check.yml` (clang-format 19, informational).
