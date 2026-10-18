---
name: run-e2e
description: Run the end-to-end tests for Exult's command-line tools (expack, ipack, ucc, ...) with tests/e2e/run.sh.
---

# run-e2e

```bash
tests/e2e/run.sh      # builds the command-line tools and runs the e2e tests
```

This is the entry point the CI job `E2E (tools)` uses. `tests/e2e/` is added by
the CI/tests slice of the ACMM rollout; if it does not exist yet, say so.

- Run it when you change `tools/` (for example `tools/expack.cc`,
  `tools/compiler/`), `files/` (Flex and other file I/O) or `shapes/`.
- E2E tests must use files they generate themselves. Never add original
  Ultima VII data files as fixtures.
- Read `tests/e2e/run.sh` for the exact prerequisites (compilers, container
  runtime) rather than assuming them.
- Report the command, its exit status and the failing test names, if any.
