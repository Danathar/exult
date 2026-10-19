#!/usr/bin/env bash
# End-to-end check of Exult's command-line tools, using only data created here
# (no Ultima VII game data is needed or used):
#
#   1. ucc compiles a small usecode script; a script with a syntax error must be
#      rejected (non-zero exit, no output file).
#   2. expack builds a Flex archive from known files, lists it, extracts it, and
#      the extracted bytes must equal the inputs. A truncated archive must not
#      round-trip.
#   3. tests/e2e/tool-regressions.sh checks expack -i response files, textpack -x
#      and ipack (blank lines, long names, tiled updates) on synthetic input.
#
# Usage:
#   tests/e2e/run.sh                      # configure + build ucc and expack, then test
#   EXULT_BIN_DIR=/path tests/e2e/run.sh  # use prebuilt ucc/expack found in that dir
#                                         # (or in its tools/ and tools/compiler/)
#
# Environment: JOBS (make -j, default nproc), BUILD_DIR (default ${TMPDIR:-/tmp}/exult-e2e-build, outside the
# source tree; note autoreconf still writes ignored files into it). Needs the Exult build dependencies (see tests/README.md).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
jobs="${JOBS:-$(nproc)}"

find_tool() { # name dir...
	local name=$1 dir
	shift
	for dir in "$@"; do
		if [ -x "$dir/$name" ]; then
			echo "$dir/$name"
			return 0
		fi
	done
	return 1
}

if [ -n "${EXULT_BIN_DIR:-}" ]; then
	d="$EXULT_BIN_DIR"
	ucc="$(find_tool ucc "$d" "$d/tools/compiler")" || { echo "ucc not found under $d" >&2; exit 2; }
	expack="$(find_tool expack "$d" "$d/tools")" || { echo "expack not found under $d" >&2; exit 2; }
	textpack="$(find_tool textpack "$d" "$d/tools")" || textpack=""
	ipack="$(find_tool ipack "$d" "$d/tools")" || ipack=""
else
	build="${BUILD_DIR:-${TMPDIR:-/tmp}/exult-e2e-build}"
	mkdir -p "$build"
	if [ ! -x "$root/configure" ]; then
		(cd "$root" && autoreconf -i)
	fi
	if [ ! -f "$build/Makefile" ]; then
		# Only the tools are needed: no game binary, audio, data files or zip saves.
		(cd "$build" && "$root/configure" --disable-exult --enable-compiler \
			--disable-fluidsynth --disable-alsa --disable-timidity-midi --disable-mt32emu \
			--disable-data --disable-zip-support)
	fi
	make -C "$build/files" -j"$jobs" libu7file.la
	make -C "$build/usecode" -j"$jobs" libusecode.la
	make -C "$build/tools" -j"$jobs" expack textpack
	make -C "$build/tools/compiler" -j"$jobs" ucc
	ucc="$build/tools/compiler/ucc"
	expack="$build/tools/expack"
	textpack="$build/tools/textpack"
	# ipack needs libpng and SDL; skip its checks if it cannot be built here.
	ipack=""
	if make -C "$build/shapes" -j"$jobs" libshapes.la && make -C "$build/imagewin" -j"$jobs" libimagewin.la \
		&& make -C "$build/tools" -j"$jobs" ipack; then
		ipack="$build/tools/ipack"
	else
		echo "WARN - ipack could not be built; skipping the ipack checks" >&2
	fi
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0
ok() { echo "ok   - $1"; }
bad() { echo "FAIL - $1" >&2; fail=1; }

# --- ucc ---------------------------------------------------------------
cat > "$work/good.uc" <<'UC'
#game "blackgate"
#autonumber 0xC00

var adder (var a, var b)
{
	return a + b;
}
UC
if (cd "$work" && "$ucc" -o good.uco good.uc >ucc-good.log 2>&1) && [ -s "$work/good.uco" ]; then
	ok "ucc compiles a valid usecode script"
else
	bad "ucc failed on a valid script"; cat "$work/ucc-good.log" >&2 || true
fi

cat > "$work/broken.uc" <<'UC'
#game "blackgate"
#autonumber 0xC00

var broken (var a
{
	return a +;
}
UC
if (cd "$work" && "$ucc" -o broken.uco broken.uc >ucc-bad.log 2>&1); then
	bad "ucc accepted a script with a syntax error"
elif [ -e "$work/broken.uco" ] && [ -s "$work/broken.uco" ]; then
	bad "ucc wrote output for a script with a syntax error"
else
	ok "ucc rejects a script with a syntax error"
fi

# --- expack ------------------------------------------------------------
mkdir "$work/in" "$work/out"
printf 'first file\n' > "$work/in/a.bin"
head -c 4096 /dev/zero | tr '\0' 'Z' > "$work/in/b.bin"
printf '\x00\x01\x02\xff\xfe\xfd binary \x00 tail' > "$work/in/c.bin"

if (cd "$work" && "$expack" -c test.flx in/a.bin in/b.bin in/c.bin >pack.log 2>&1); then
	ok "expack -c creates a Flex archive"
else
	bad "expack -c failed"; cat "$work/pack.log" >&2
fi

if (cd "$work" && "$expack" -l test.flx >list.log 2>&1); then
	ok "expack -l lists the archive"
else
	bad "expack -l failed"; cat "$work/list.log" >&2
fi
if grep -Eq '^Size: 3$' "$work/list.log" && grep -Eq '^1[[:space:]]+4096$' "$work/list.log"; then
	ok "expack -l reports 3 entries and the 4096-byte length"
else
	bad "expack -l output does not show 3 entries / 4096 bytes"; cat "$work/list.log" >&2
fi

if (cd "$work/out" && "$expack" -x ../test.flx >../extract.log 2>&1); then
	ok "expack -x extracts the archive"
else
	bad "expack -x failed"; cat "$work/extract.log" >&2
fi

# Entries are extracted as 00000.u7o ...; compare against the inputs byte for byte.
i=0
for src in a b c; do
	out="$(printf '%s/%05d.u7o' "$work/out" "$i")"
	if [ -f "$out" ] && cmp -s "$out" "$work/in/$src.bin"; then
		ok "extracted entry $i equals $src.bin"
	else
		bad "extracted entry $i ($out) differs from $src.bin"
	fi
	i=$((i + 1))
done

# Negative control: a truncated archive must not reproduce the originals.
head -c 100 "$work/test.flx" > "$work/trunc.flx"
mkdir "$work/out2"
(cd "$work/out2" && "$expack" -x ../trunc.flx >/dev/null 2>&1) || true
if [ -f "$work/out2/00001.u7o" ] && cmp -s "$work/out2/00001.u7o" "$work/in/b.bin"; then
	bad "truncated archive still round-tripped (comparison is not discriminating)"
else
	ok "truncated archive does not reproduce entry 1"
fi

# --- regressions in expack -i, textpack and ipack ------------------------------
if EXULT_EXPACK="$expack" EXULT_TEXTPACK="$textpack" EXULT_IPACK="$ipack" "$root/tests/e2e/tool-regressions.sh"; then
	ok "tool regression checks"
else
	bad "tool regression checks"
fi

if [ "$fail" -ne 0 ]; then
	echo "e2e: FAILED" >&2
	exit 1
fi
echo "e2e: all checks passed"
