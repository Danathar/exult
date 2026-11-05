#!/usr/bin/env bash
# Build and run the Exult unit tests. Needs only a C++17 compiler: no SDL,
# no game data, no autotools run.
#
#   tests/run-unit-tests.sh              # build with $CXX (default g++) and run
#   CXX=clang++ tests/run-unit-tests.sh
#   COVERAGE=1 tests/run-unit-tests.sh   # add --coverage (used by coverage-gate.yml)
#   BUILD_DIR=/some/dir tests/run-unit-tests.sh   # default: ${TMPDIR:-/tmp}/exult-unit-tests
#
# Exits non-zero if the build fails or any check fails.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build="${BUILD_DIR:-${TMPDIR:-/tmp}/exult-unit-tests}"
cxx="${CXX:-g++}"

# _GLIBCXX_ASSERTIONS turns an out-of-range std::string_view / std::vector
# access into an abort instead of a silent out-of-bounds read, so a bounds bug
# fails the test even when the bytes it reads happen to give the right answer.
# -MMD writes a .d file per object, listing the headers it includes; the
# mutation check (tests/mutate_changed.py) reads them to know which files the
# unit build sees.
flags=(-DEXULT_DATADIR=\"/usr/share/exult\" -MMD -D_GLIBCXX_ASSERTIONS -std=c++17 -O0 -g -Wall -Wextra -Wno-unused-parameter -Werror=return-type)
coverage=()
if [ "${COVERAGE:-0}" = 1 ]; then
	coverage=(--coverage)
fi

includes=(-I"$root" -I"$root/headers" -I"$root/files" -I"$root/files/sha1" -I"$root/shapes" -I"$root/imagewin" -I"$root/objs" -I"$root/tests/unit")

# Product sources compiled into the test binary (all are free of SDL and game data).
sources=(
	"$root/istring.cc"
	"$root/files/utils.cc"
	"$root/files/listfiles.cc"
	"$root/files/msgfile.cc"
	"$root/files/crc.cc"
	"$root/files/sha1/sha1.cpp"
	"$root/conf/Configuration.cc"
	"$root/conf/XMLEntity.cc"
)

# Needed to load a shape file, and also free of SDL and game data. The tests use
# a small part of these, so they are built without --coverage: the coverage
# floor keeps measuring the sources above.
support_sources=(
	"$root/shapes/vgafile.cc"
	"$root/imagewin/imagebuf.cc"
	"$root/imagewin/ibuf8.cc"
	"$root/files/Flex.cc"
	"$root/files/Flat.cc"
	"$root/files/IFF.cc"
	"$root/files/Table.cc"
	"$root/files/U7file.cc"
	"$root/files/U7fileman.cc"
	"$root/files/U7obj.cc"
)
tests=("$root"/tests/unit/*.cc)

mkdir -p "$build"
# Stale coverage counters from a previous run would skew the measurement.
rm -f "$build"/*.gcda

objs=()
for src in "${sources[@]}" "${tests[@]}"; do
	obj="$build/$(basename "$src").o"
	"$cxx" "${flags[@]}" ${coverage[@]+"${coverage[@]}"} "${includes[@]}" -c "$src" -o "$obj"
	objs+=("$obj")
done
for src in "${support_sources[@]}"; do
	obj="$build/$(basename "$src").o"
	"$cxx" "${flags[@]}" "${includes[@]}" -c "$src" -o "$obj"
	objs+=("$obj")
done

"$cxx" "${flags[@]}" ${coverage[@]+"${coverage[@]}"} "${objs[@]}" -o "$build/unit-tests"

# Run from the build dir: some tests create temporary files in the CWD.
cd "$build"
./unit-tests
