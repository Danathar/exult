---
name: build-and-test
description: Build Exult on Linux and run the repository's unit tests before committing or opening a PR.
---

# build-and-test

From the repository root (use absolute paths or `git -C`, not `cd`):

```bash
tests/run-unit-tests.sh      # builds and runs the unit tests
```

`tests/` is added by the CI/tests slice of the ACMM rollout. If `ls tests`
shows nothing, that PR has not merged yet; say so instead of inventing a
substitute.

To build the whole engine (this is what `.github/workflows/ci-linux.yml` does;
check that file for the current package list and flags):

```bash
autoreconf -v -i
./configure --with-debug=extreme --enable-exult-studio --enable-exult-studio-support \
    --enable-compiler --enable-zip-support --enable-shared --enable-midi-sfx \
    --enable-data --enable-mods
make -j"$(nproc)"
```

Build out of tree or in a scratch copy under `/var/tmp/` when you can, and
never commit generated files. Anything needing the original game data, a
display or audio cannot be tested this way: say so in the PR.

Any `gh` write command passes `--repo Danathar/exult`. Report the exact
commands and what they printed; do not claim a check you did not run.
