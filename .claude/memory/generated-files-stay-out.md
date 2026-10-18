# Generated build files stay out of commits

**Date:** 2026-10-18
**Wrong:** committing output of `autoreconf`/`make` such as `configure`,
`Makefile.in`, `ucparse.cc`, `uclex.cc` or `.o` files.
**Right:** these are generated (the usecode compiler sources come from
`tools/compiler/ucparse.yy` and `uclex.ll`) and covered by `.gitignore`. Build
in a scratch directory and check `git status --short` before committing.
**Why it matters:** generated files bloat the diff and conflict with upstream.
**Evidence:** `.gitignore` entries `ucparse.cc`, `uclex.cc`;
`git ls-files tools/compiler` lists only `ucparse.yy`/`uclex.ll`.
