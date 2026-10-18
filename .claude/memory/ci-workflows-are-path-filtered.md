# The upstream ci-* workflows are path-filtered

**Date:** 2026-10-18
**Wrong:** treating "all checks green" on a docs- or `.md`-only PR as proof the
code still builds.
**Right:** `ci-linux.yml` (and the other `ci-*.yml`) list `paths` that exclude
`docs/**`, `**.md`, `**README**`, `**.txt`, `.clang*`, `.gitignore`,
`.gitattributes` and most of `.github/workflows/*`. Such PRs get only the
repository's own checks. Files like `.editorconfig`, `.claude/` or `.cursor/`
are not excluded and do trigger the builds. `format-check.yml` runs on every PR
but is informational (`continue-on-error`).
**Why it matters:** a build break can hide behind a PR that never built.
**Evidence:** `on.pull_request.paths` in `.github/workflows/ci-linux.yml`;
`.github/workflows/format-check.yml`.
