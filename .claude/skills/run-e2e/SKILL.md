---
name: run-e2e
description: Run the end-to-end tests for Exult's command-line tools (ucc and expack) with tests/e2e/run.sh.
---

# run-e2e

```bash
tests/e2e/run.sh      # builds the command-line tools and runs the e2e tests
```

This is the entry point the CI job `E2E (tools)` uses. `tests/e2e/` is added by
the CI/tests slice of the ACMM rollout; if it does not exist yet, say so.

- Run it when you change `tools/expack.cc`, `tools/compiler/`, `files/` (Flex and other file I/O) or `shapes/`.
- E2E tests must use files they generate themselves. Never add original
  Ultima VII data files as fixtures.
- It builds and tests only `ucc` and `expack`; it needs the Exult build
  dependencies but no container. Read `tests/e2e/run.sh` and `tests/README.md`
  for the exact prerequisites and the `EXULT_BIN_DIR` option.
- Any `gh` write command passes `--repo Danathar/exult`.
- Report the command, its exit status and the failing test names, if any.
