#!/usr/bin/env bash
# End-to-end check of Exult's command-line tools, using only data created here
# (no Ultima VII game data is needed or used):
#
#   1. ucc compiles a small usecode script; a script with a syntax error must be
#      rejected (non-zero exit, no output file).
#   2. expack builds a Flex archive from known files, lists it, extracts it, and
#      the extracted bytes must equal the inputs. A truncated archive must not
#      round-trip.
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
	make -C "$build/tools" -j"$jobs" expack
	make -C "$build/tools/compiler" -j"$jobs" ucc
	ucc="$build/tools/compiler/ucc"
	expack="$build/tools/expack"
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

# expack -i MANIFEST OUTDIR: the manifest and one input sit in a read-only
# "source" dir, another input exists only in OUTDIR (as a generated file does
# in a build tree). The archive and header must land in OUTDIR, nothing may be
# written next to the manifest, and both inputs must be packed.
mkdir -p "$work/msrc/sub" "$work/mbuild/sub" "$work/mout"
cp "$work/in/a.bin" "$work/msrc/sub/a.bin"
cp "$work/in/b.bin" "$work/mbuild/sub/gen.bin"
printf '../pack.flx\na.bin\ngen.bin\n' > "$work/msrc/sub/list.in"
chmod a-w "$work/msrc/sub"
if (cd "$work" && "$expack" -i msrc/sub/list.in mbuild/sub >manifest.log 2>&1) \
	&& [ -s "$work/mbuild/pack.flx" ] && [ -s "$work/mbuild/pack_flx.h" ]; then
	ok "expack -i MANIFEST OUTDIR writes the archive and header under OUTDIR"
else
	bad "expack -i MANIFEST OUTDIR did not write mbuild/pack.flx and mbuild/pack_flx.h"; cat "$work/manifest.log" >&2
fi
if [ "$(ls "$work/msrc/sub")" = "$(printf 'a.bin\nlist.in')" ] && [ ! -e "$work/msrc/pack.flx" ]; then
	ok "expack -i MANIFEST OUTDIR writes nothing next to the manifest"
else
	bad "expack -i MANIFEST OUTDIR wrote into the manifest's directory"
fi
chmod u+w "$work/msrc/sub"
(cd "$work/mout" && "$expack" -x ../mbuild/pack.flx >/dev/null 2>&1) || true
if cmp -s "$work/mout/00000.u7o" "$work/in/a.bin" && cmp -s "$work/mout/00001.u7o" "$work/in/b.bin"; then
	ok "expack -i MANIFEST OUTDIR packs inputs from next to the manifest and from OUTDIR"
else
	bad "expack -i MANIFEST OUTDIR packed the wrong inputs"
fi
if grep -Eq '^#define[[:space:]]+PACK_FLX_GEN_BIN[[:space:]]+1$' "$work/mbuild/pack_flx.h" 2>/dev/null; then
	ok "expack -i MANIFEST OUTDIR names the OUTDIR input in the header"
else
	bad "expack -i MANIFEST OUTDIR header lacks the OUTDIR input"
fi

if [ "$fail" -ne 0 ]; then
	echo "e2e: FAILED" >&2
	exit 1
fi
echo "e2e: all checks passed"
