# Tests

Two entry points, both exit non-zero on failure. Neither needs Ultima VII game
data or a display.

## Unit tests: `tests/run-unit-tests.sh`

Builds `tests/unit/*.cc` together with a handful of SDL-free product sources
(`istring.cc`, `files/utils.cc`, `files/listfiles.cc`, `files/crc.cc`,
`files/sha1/sha1.cpp`) and the headers `rect.h`, `hash_utils.h`,
`files/databuf.h`, `files/endianio.h`, then runs them. It needs only a C++17
compiler; autotools is not involved.

```sh
tests/run-unit-tests.sh                 # g++
CXX=clang++ tests/run-unit-tests.sh     # clang
COVERAGE=1 tests/run-unit-tests.sh      # add --coverage (used by the coverage gate)
```

The build goes to `${TMPDIR:-/tmp}/exult-unit-tests` unless `BUILD_DIR` is set.
The harness is a small assert-based one in `tests/unit/harness.h` (`TEST(name)`,
`CHECK`, `CHECK_EQ`). To add a test, create `tests/unit/test_*.cc`; it is picked
up automatically. These tests are not wired into automake `make check`: the
configured build needs SDL3 and friends, which the unit tests deliberately avoid.

## End-to-end tests: `tests/e2e/run.sh`

Builds the command-line tools `ucc` and `expack` (autoreconf + configure with
`--disable-exult --enable-compiler`, then only the needed targets), then:

- compiles a small usecode script with `ucc` and checks that a script with a
  syntax error is rejected;
- packs files into a Flex archive with `expack -c`, lists it with `-l`,
  extracts it with `-x`, and compares the extracted bytes to the inputs.

```sh
tests/e2e/run.sh                          # configure, build, test
EXULT_BIN_DIR=/path/to/build tests/e2e/run.sh   # use prebuilt ucc/expack
```

Build dependencies (Debian 13): `g++ make autoconf automake libtool
autoconf-archive pkg-config bison flex zlib1g-dev libsdl3-dev
libsdl3-image-dev libpng-dev libogg-dev libvorbis-dev`. `autoreconf` writes
generated files into the source tree (they are gitignored).

## Coverage floor

`.github/workflows/coverage-gate.yml` runs the unit tests with `COVERAGE=1` and
uses `gcovr` to measure line coverage over the files named in
`.coverage-thresholds.json` (`source_filter`), failing below
`line_coverage_floor`. Raise the floor when coverage rises.

## CI

`.github/workflows/ci.yml` (`CI`) runs `Unit tests (gcc)`, `Unit tests (clang)` and
`E2E (tools)` in Debian 13 containers on every pull request and push to
`master`. The upstream `ci-*.yml` workflows still perform the full platform builds.
