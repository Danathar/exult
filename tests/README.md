# Tests

Two entry points, both exit non-zero on failure. Neither needs Ultima VII game
data or a display.

## Unit tests: `tests/run-unit-tests.sh`

Builds `tests/unit/*.cc` together with a handful of SDL-free product sources
(`istring.cc`, `files/utils.cc`, `files/listfiles.cc`, `files/msgfile.cc`,
`files/crc.cc`, `files/sha1/sha1.cpp`) and the headers `rect.h`, `hash_utils.h`,
`files/databuf.h`, `files/endianio.h`, then runs them. It needs only a C++17
compiler; autotools is not involved. The build defines `_GLIBCXX_ASSERTIONS`,
so an out-of-range `std::string_view` or `std::vector` access aborts the run.

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
  extracts it with `-x`, and compares the extracted bytes to the inputs;
- packs a manifest with `expack -i MANIFEST OUTDIR` and checks that the archive
  and header land in `OUTDIR` and nothing is written next to the manifest;
- runs `tests/e2e/tool-regressions.sh`: `expack -i` response files (CRLF, bad `:N` lines),
  `expack -l/-x` on a missing archive, `textpack -x` on entries without a NUL, and `ipack`
  (blank script lines, over-long names, `-u` with tiled specs) on synthetic input.

```sh
tests/e2e/run.sh                          # configure, build, test
EXULT_BIN_DIR=/path/to/build tests/e2e/run.sh   # use prebuilt ucc/expack
```

Build dependencies (Debian 13): `g++ make autoconf automake libtool
autoconf-archive pkg-config bison flex zlib1g-dev libsdl3-dev
libsdl3-image-dev libpng-dev libogg-dev libvorbis-dev`. `autoreconf` writes
generated files into the source tree (they are gitignored).

## Out-of-tree build: `tests/out-of-tree-build.sh`

Copies the checkout, runs `autoreconf` in the copy, makes the copy read-only,
then configures with `--enable-data --enable-mods --enable-compiler` in a
separate directory and builds everything. Any rule that writes into the source
tree fails the build. It then checks that the generated Flex files, headers,
mod usecode and `gitinfo.h` are in the build tree, that `make install` finds
them, that `make` refuses to build while stale generated headers from an
in-tree build sit in the source tree (quoted includes would pick them up before
the build tree's copies), and that `make maintainer-clean` removes every file
the build created.

```sh
tests/out-of-tree-build.sh                # source copy with git metadata
WITH_GIT=0 tests/out-of-tree-build.sh     # source copy without .git, like a tarball
tests/out-of-tree-build.sh --disable-alsa # extra arguments go to configure
```

Run it as a normal user: root ignores the read-only permission bits, and the
script stops if the copy is still writable. Needs the same dependencies as the
end-to-end tests, plus `git`.

## Coverage floor

`.github/workflows/coverage-gate.yml` runs the unit tests with `COVERAGE=1` and
uses `gcovr` to measure line coverage over the files named in
`.coverage-thresholds.json` (`source_filter`), failing below
`line_coverage_floor`. Raise the floor when coverage rises.

## CI

`.github/workflows/ci.yml` (`CI`) runs `Unit tests (gcc)`, `Unit tests (clang)`,
`E2E (tools)` and `Out-of-tree build (read-only source)` in Debian 13 containers
on every pull request and push to `master`. The upstream `ci-*.yml` workflows
still perform the full platform builds.
