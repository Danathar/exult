#!/usr/bin/env bash
# Regression checks for the command-line tools expack, textpack, ipack, ucxt, rip, shp2pcx,
# smooth and mockup, using only data created here or the sample images shipped with
# smooth and mockup (no Ultima VII game data). Called by
# tests/e2e/run.sh, which builds the tools; it can also be run on its own:
#
#   EXULT_EXPACK=/path/expack [EXULT_TEXTPACK=/path/textpack] [EXULT_IPACK=/path/ipack] \
#       [EXULT_UCXT=/path/ucxt EXULT_UCXT_DATA=/dir/with/ucxt/.data/files EXULT_UCC=/path/ucc] \
#       [EXULT_RIP=/path/rip] [EXULT_SHP2PCX=/path/shp2pcx] \
#       [EXULT_SMOOTH=/path/smooth [EXULT_SMOOTH_PLUGINS=/dir/with/libsmooth_*.so]] \
#       [EXULT_MOCKUP=/path/mockup] \
#       tests/e2e/tool-regressions.sh
#
# A tool whose path is empty or unset is skipped; the ucxt checks need all three
# ucxt variables. Every invocation is wrapped in
# `timeout` so that a hang is reported as a failure instead of stalling the job.
set -uo pipefail

expack="${EXULT_EXPACK:-}"
textpack="${EXULT_TEXTPACK:-}"
ipack="${EXULT_IPACK:-}"
ucxt="${EXULT_UCXT:-}"
ucxt_data="${EXULT_UCXT_DATA:-}"
ucc="${EXULT_UCC:-}"
rip="${EXULT_RIP:-}"
shp2pcx="${EXULT_SHP2PCX:-}"
smooth="${EXULT_SMOOTH:-}"
smooth_plugins="${EXULT_SMOOTH_PLUGINS:-}"
mockup="${EXULT_MOCKUP:-}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0
ok() { echo "ok   - $1"; }
bad() { echo "FAIL - $1" >&2; fail=1; }

# Run a command with a time limit, capturing output in $work/last.log and the
# exit status in $rc. run_in does the same from inside the given directory.
# SDL tools (smooth, mockup) treat SIGTERM as a quit request they never read,
# so -k sends SIGKILL if the command is still running 5 seconds later.
rc=0
run_in() { # dir command...
	local dir=$1
	shift
	rc=0
	(cd "$dir" && timeout -k 5 30 "$@") >"$work/last.log" 2>&1 || rc=$?
}
run() { run_in . "$@"; }

# A clean error exit is status 1: not a signal (>= 128) and not a timeout (124).
expect_clean_error() { # description command...
	local what=$1
	shift
	run "$@"
	if [ "$rc" -eq 1 ]; then
		ok "$what exits 1"
	else
		bad "$what exited $rc, expected 1"; cat "$work/last.log" >&2
	fi
}

# --- expack -i (response files) -------------------------------------------
if [ -n "$expack" ]; then
	for kind in lf crlf; do
		mkdir "$work/$kind"
		printf 'AAA' > "$work/$kind/a.dat"
		printf 'BBBB' > "$work/$kind/b.dat"
	done
	printf 'out.flx\na.dat\n\nb.dat\n' > "$work/lf/resp.txt"
	printf 'out.flx\r\na.dat\r\n\r\nb.dat\r\n' > "$work/crlf/resp.txt"
	for kind in lf crlf; do
		run_in "$work/$kind" "$expack" -i resp.txt
		if [ "$rc" -eq 0 ]; then
			ok "expack -i accepts a $kind response file"
		else
			bad "expack -i failed on a $kind response file (rc=$rc)"; cat "$work/last.log" >&2
		fi
	done
	if [ -f "$work/crlf/out.flx" ] && [ -f "$work/crlf/out_flx.h" ] \
		&& cmp -s "$work/lf/out.flx" "$work/crlf/out.flx" && cmp -s "$work/lf/out_flx.h" "$work/crlf/out_flx.h"; then
		ok "CRLF response file gives the same archive and header as LF"
	else
		bad "CRLF response file gives a different archive or header than LF"
	fi

	printf 'out.flx\n:5foo\n' > "$work/r1.txt"
	printf 'out.flx\n:-1:foo\n' > "$work/r2.txt"
	printf 'out.flx\n:99999999999:foo\n' > "$work/r3.txt"
	printf 'out.flx\n:0x7fffffff:foo\n' > "$work/r4.txt"
	for n in 1 2 3 4; do
		expect_clean_error "expack -i with bad shape number line (r$n)" "$expack" -i "$work/r$n.txt"
		if grep -q '^Line 2:' "$work/last.log"; then
			ok "expack -i r$n reports the line number"
		else
			bad "expack -i r$n did not report 'Line 2:'"; cat "$work/last.log" >&2
		fi
	done

	printf 'out.flx\n\n\n:5foo\n' > "$work/r5.txt"
	run "$expack" -i "$work/r5.txt"
	if grep -q '^Line 4:' "$work/last.log"; then
		ok "expack -i counts blank lines in error line numbers"
	else
		bad "expack -i reported the wrong line number after blank lines"; cat "$work/last.log" >&2
	fi

	expect_clean_error "expack -l on a missing archive" "$expack" -l "$work/nonexistent.flx"
	expect_clean_error "expack -x on a missing archive" "$expack" -x "$work/nonexistent.flx"
fi

# --- textpack -x (entries that are not NUL-terminated) ---------------------
if [ -n "$textpack" ]; then
	# Flex with two entries, "abc" and "hello", neither NUL-terminated:
	# 0x50-byte title, magic, count, padding to 0x80, (offset,length) table, data.
	{
		printf 'x'
		head -c 79 /dev/zero
		printf '\x00\x1a\xff\xff\x02\x00\x00\x00'
		head -c 40 /dev/zero
		printf '\x90\x00\x00\x00\x03\x00\x00\x00\x93\x00\x00\x00\x05\x00\x00\x00abchello'
	} > "$work/nonterm.flx"
	run "$textpack" -x "$work/nonterm.flx"
	if [ "$rc" -eq 0 ] && grep -qx '0:abc' "$work/last.log" && grep -qx '1:hello' "$work/last.log"; then
		ok "textpack -x extracts entries that are not NUL-terminated"
	else
		bad "textpack -x mishandled entries that are not NUL-terminated (rc=$rc)"; cat "$work/last.log" >&2
	fi
fi

# --- ipack -----------------------------------------------------------------
if [ -n "$ipack" ]; then
	mkdir "$work/ip"
	# 8x8 and 16x8 8-bit paletted (two-colour) PNGs.
	s8='iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAMAAADz0U65AAAABlBMVEUAAAD///+l2Z/dAAAAEElEQVR4nGNgYESDDGSJAAAEyAAhp0a2agAAAABJRU5ErkJggg=='
	t16='iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAMAAADHqI+lAAAABlBMVEUAAAD///+l2Z/dAAAAEElEQVR4nGNgYCQAGeiiAgARiABBwv6CowAAAABJRU5ErkJggg=='
	printf '%s' "$s8" | base64 -d > "$work/ip/s00.png"
	cp "$work/ip/s00.png" "$work/ip/s01.png"
	printf '%s' "$t16" | base64 -d > "$work/ip/tiles.png"

	# Blank lines (including trailing ones) and CRLF must not hang ipack.
	printf 'archive blank.vga\n\n0/2:s flat\n\n\n' > "$work/ip/blank.txt"
	printf 'archive crlf.vga\r\n\r\n0/2:s flat\r\n\r\n' > "$work/ip/crlf.txt"
	for script in blank crlf; do
		run_in "$work/ip" "$ipack" -c "$script.txt"
		if [ "$rc" -eq 0 ] && [ -s "$work/ip/$script.vga" ]; then
			ok "ipack -c accepts a script with blank lines ($script)"
		else
			bad "ipack -c failed or hung on a script with blank lines ($script, rc=$rc)"; cat "$work/last.log" >&2
		fi
	done

	# An over-long filename gets an error, not a stack overflow.
	{
		printf 'archive long.vga\n0/1:'
		head -c 500 /dev/zero | tr '\0' 'a'
		printf '\n'
	} > "$work/ip/long.txt"
	run_in "$work/ip" "$ipack" -c long.txt
	if [ "$rc" -eq 1 ]; then
		ok "ipack -c rejects an over-long filename"
	else
		bad "ipack -c on an over-long filename exited $rc, expected 1"; cat "$work/last.log" >&2
	fi

	# -u must handle tiled specs just like -c.
	printf 'archive tc.vga\n0/2:tiles.png(2 across) flat\n' > "$work/ip/tiles.txt"
	run_in "$work/ip" "$ipack" -c tiles.txt
	if [ "$rc" -eq 0 ] && [ -s "$work/ip/tc.vga" ]; then
		cp "$work/ip/tc.vga" "$work/ip/tc-created.vga"
		run_in "$work/ip" "$ipack" -u tiles.txt
		if [ "$rc" -eq 0 ] && cmp -s "$work/ip/tc.vga" "$work/ip/tc-created.vga"; then
			ok "ipack -u updates a tiled entry the same way -c creates it"
		else
			bad "ipack -u failed on a tiled spec (rc=$rc)"; cat "$work/last.log" >&2
		fi
	else
		bad "ipack -c failed on a tiled spec (rc=$rc)"; cat "$work/last.log" >&2
	fi
fi

# --- ucxt ----------------------------------------------------------------------
# EXULT_UCXT_DATA holds ucxt's five .data files (u7misc, u7opcodes and the three
# generated intrinsics tables). Every run uses -nc, which reads them from the
# current directory and needs no exult.cfg or game data.
if [ -n "$ucxt" ] && [ -n "$ucxt_data" ] && [ -n "$ucc" ]; then
	mkdir "$work/ux" "$work/ux-empty" "$work/ux-nobg" "$work/ux-dir"
	cp "$ucxt_data"/*.data "$work/ux/"
	cat > "$work/adder.uc" <<'UC'
#game "blackgate"
#autonumber 0xC00

var adder (var a, var b)
{
	return a + b;
}
UC
	run_in "$work" "$ucc" -o adder.uco adder.uc
	if [ "$rc" -ne 0 ] || [ ! -s "$work/adder.uco" ]; then
		bad "ucc could not compile the ucxt input (rc=$rc)"; cat "$work/last.log" >&2
	fi

	# Disassembling a script ucc just compiled shows its function and opcodes.
	listing_ok() { # file
		grep -q '\.funcnumber  0C00H' "$1" && grep -Eq '^0006:[[:space:]]+add$' "$1" \
			&& grep -Eq '^0007:[[:space:]]+retv$' "$1"
	}
	run_in "$work/ux" "$ucxt" -nc -bg -i../adder.uco -a
	if [ "$rc" -eq 0 ] && listing_ok "$work/last.log"; then
		ok "ucxt -nc disassembles a script compiled by ucc"
	else
		bad "ucxt -nc did not disassemble the ucc output (rc=$rc)"; cat "$work/last.log" >&2
	fi

	# -oFILE sends the listing to FILE, and the file is complete when ucxt exits.
	run_in "$work/ux" "$ucxt" -nc -bg -i../adder.uco -a -o../adder.txt
	if [ "$rc" -eq 0 ] && [ -f "$work/adder.txt" ] && listing_ok "$work/adder.txt" \
		&& ! grep -q '\.funcnumber' "$work/last.log"; then
		ok "ucxt -o writes the whole listing to the file"
	else
		bad "ucxt -o did not write the listing to the file (rc=$rc)"; cat "$work/last.log" >&2
		cat "$work/adder.txt" >&2 2>/dev/null || true
	fi

	# ucxt_fails_in DIR DESC ARGS...: ucxt run from DIR must exit 1 (a clean error).
	ucxt_fails_in() {
		local dir=$1 what=$2
		shift 2
		run_in "$dir" "$ucxt" "$@"
		if [ "$rc" -eq 1 ]; then
			ok "$what exits 1"
		else
			bad "$what exited $rc, expected 1"; cat "$work/last.log" >&2
		fi
	}

	# A usecode file that does not exist is an error, not a crash.
	ucxt_fails_in "$work/ux" "ucxt with a missing usecode file" -nc -bg -inot-there.uco -a
	if grep -q 'Failed to locate usecode file' "$work/last.log"; then
		ok "ucxt names the missing usecode file problem"
	else
		bad "ucxt did not report the missing usecode file"; cat "$work/last.log" >&2
	fi

	# A missing data file is reported before anything is loaded, with the -nc hint.
	cp "$work/ux/u7misc.data" "$work/ux/u7opcodes.data" "$work/ux-nobg/"
	for dir in ux-empty ux-nobg; do
		case $dir in
			ux-empty) missing=u7misc.data ;;
			ux-nobg) missing=u7bgintrinsics.data ;;
		esac
		ucxt_fails_in "$work/$dir" "ucxt -nc without $missing" -nc -bg -i../adder.uco -a
		if grep -qF "cannot open ucxt data file './$missing'" "$work/last.log" \
			&& grep -q 'With -nc, ucxt data files must be in the current directory' "$work/last.log"; then
			ok "ucxt -nc names the missing $missing and where it looked"
		else
			bad "ucxt -nc did not report the missing $missing"; cat "$work/last.log" >&2
		fi
	done

	# A data file that exists but cannot be read stops ucxt instead of leaving its
	# opcode table empty.
	cp "$work/ux"/*.data "$work/ux-dir/"
	rm "$work/ux-dir/u7opcodes.data"
	mkdir "$work/ux-dir/u7opcodes.data"
	ucxt_fails_in "$work/ux-dir" "ucxt -nc with an unreadable u7opcodes.data" -nc -bg -i../adder.uco -a
	if grep -qF "Failed to load ucxt data file './u7opcodes.data'" "$work/last.log"; then
		ok "ucxt -nc names the unreadable u7opcodes.data"
	else
		bad "ucxt -nc did not report the unreadable u7opcodes.data"; cat "$work/last.log" >&2
	fi
fi

# --- rip -------------------------------------------------------------------
# A function number that is not hex must print the usage text and exit non-zero
# instead of using an uninitialised number. A valid number is still accepted (the
# tool then stops because the scratch directory has no usecode file).
if [ -n "$rip" ]; then
	mkdir "$work/rip"
	for args in "foo" "put zz"; do
		# shellcheck disable=SC2086 # word splitting of $args is intended
		run_in "$work/rip" "$rip" $args
		if [ "$rc" -eq 1 ] && grep -q 'Syntax: rip' "$work/last.log"; then
			ok "rip $args prints usage and exits 1"
		else
			bad "rip $args exited $rc, expected usage and exit 1"; cat "$work/last.log" >&2
		fi
	done
	run_in "$work/rip" "$rip" 0A1
	if [ "$rc" -eq 0 ] && grep -q "Can't open usecode file" "$work/last.log" && ! grep -q 'Syntax: rip' "$work/last.log"; then
		ok "rip accepts a hex function number"
	else
		bad "rip rejected a valid hex function number (exit $rc)"; cat "$work/last.log" >&2
	fi
fi

# --- shp2pcx ---------------------------------------------------------------
# Synthetic shapes. A frame whose four extents are all 0x7FFF is 65535 x 65535
# pixels: its pixel count overflows int, so it must be rejected with an error
# rather than aborting. A one-pixel shape must still convert.
if [ -n "$shp2pcx" ]; then
	mkdir "$work/s2p"
	head -c 768 /dev/zero > "$work/s2p/pal.pal"
	# size 18, header size 8, frame header (4 x 0x7FFF), slice terminator
	printf '\022\000\000\000\010\000\000\000\377\177\377\177\377\177\377\177\000\000' > "$work/s2p/huge.shp"
	run_in "$work/s2p" "$shp2pcx" huge.shp huge pal.pal
	if [ "$rc" -eq 1 ] && grep -q 'Invalid frame size in huge.shp' "$work/last.log" \
		&& ! grep -Eq 'runtime error|terminate called|AddressSanitizer' "$work/last.log"; then
		ok "shp2pcx rejects a frame with huge extents"
	else
		bad "shp2pcx on a huge frame exited $rc, expected an Invalid frame size error and exit 1"; cat "$work/last.log" >&2
	fi
	# size 25, header size 8, frame header (all extents 0 = 1x1 pixel), one
	# uncompressed slice of length 1 at offset (0,0) holding pixel 7, terminator
	printf '\031\000\000\000\010\000\000\000\000\000\000\000\000\000\000\000\002\000\000\000\000\000\007\000\000' > "$work/s2p/one.shp"
	run_in "$work/s2p" "$shp2pcx" one.shp one pal.pal
	if [ "$rc" -eq 0 ] && [ -s "$work/s2p/one00.pcx" ]; then
		ok "shp2pcx converts a one-pixel shape"
	else
		bad "shp2pcx failed (exit $rc) on a one-pixel shape"; cat "$work/last.log" >&2
	fi
fi

# --- smooth ----------------------------------------------------------------
# smooth reads its config file line by line. A section line that is not
# "[name]" must be rejected with its line number (a lone "[" used to write
# before the line buffer; "[]" names no plugin), a section line with a CRLF
# ending must still name the plugin, the last line must be read once (not
# again at end of file), and a plugin library without init_plugin must be
# refused instead of called.
# Uses the sample image shipped with smooth; SDL runs with its dummy video driver.
if [ -n "$smooth" ]; then
	plugins="${smooth_plugins:-$(dirname "$smooth")}"
	mkdir "$work/smooth"
	cp "$root/tools/smooth/rough.bmp" "$work/smooth/rough.bmp"
	run_smooth() { # config [extra args...]
		local conf=$1
		shift
		run_in "$work/smooth" env SDL_VIDEO_DRIVER=dummy LD_LIBRARY_PATH="$plugins${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
			"$smooth" "$@" -i rough.bmp -c "$conf" -o out.bmp
	}

	cp "$root/tools/smooth/smooth.conf" "$work/smooth/sample.conf"
	run_smooth sample.conf
	if [ "$rc" -eq 0 ] && grep -q '^Done!' "$work/last.log" && [ -s "$work/smooth/out.bmp" ]; then
		ok "smooth converts its sample image with its sample config"
	else
		bad "smooth failed (exit $rc) on its sample image and config"; cat "$work/last.log" >&2
	fi

	printf '# comment\n[\n' > "$work/smooth/bracket.conf"
	printf '# comment\n[]\n' > "$work/smooth/empty.conf"
	printf '# comment\n[randomize' > "$work/smooth/unclosed.conf"
	for conf in bracket empty unclosed; do
		rm -f "$work/smooth/out.bmp"
		run_smooth "$conf.conf"
		if [ "$rc" -eq 255 ] && grep -q 'ERROR: Malformed section in line 2' "$work/last.log" \
			&& [ ! -e "$work/smooth/out.bmp" ]; then
			ok "smooth rejects a malformed section line ($conf) with its line number"
		else
			bad "smooth on a malformed section line ($conf) exited $rc, expected a Malformed section error"
			cat "$work/last.log" >&2
		fi
	done

	printf '[randomize]\r\n3C9134 931029\r\n' > "$work/smooth/crlf.conf"
	rm -f "$work/smooth/out.bmp"
	run_smooth crlf.conf
	if [ "$rc" -eq 0 ] && grep -q '^Done!' "$work/last.log" && [ -s "$work/smooth/out.bmp" ]; then
		ok "smooth reads a config file with CRLF line endings"
	else
		bad "smooth failed (exit $rc) on a CRLF config file"; cat "$work/last.log" >&2
	fi

	# At debug level 2 smooth prints "line read:" once per plugin data line.
	printf '[randomize]\n3C9134 931029\n' > "$work/smooth/last.conf"
	run_smooth last.conf -d 2
	lines="$(grep -c 'line read:' "$work/last.log" || true)"
	if [ "$rc" -eq 0 ] && [ "$lines" -eq 1 ]; then
		ok "smooth reads the last config line once"
	else
		bad "smooth exited $rc and read the one data line $lines times, expected once"; cat "$work/last.log" >&2
	fi

	# A library that loads but has no init_plugin: the C maths library, which
	# smooth links, under a plugin name.
	libm="$(ldd "$smooth" | awk '$1 ~ /^libm\.so/ { print $3; exit }')"
	if [ -n "$libm" ]; then
		mkdir "$work/smooth/fake"
		ln -s "$libm" "$work/smooth/fake/libsmooth_noinit.so"
		printf '[noinit]\n' > "$work/smooth/noinit.conf"
		plugins_saved="$plugins"
		plugins="$work/smooth/fake"
		run_smooth noinit.conf
		plugins="$plugins_saved"
		if [ "$rc" -eq 255 ] && grep -q 'ERROR: Plugin libsmooth_noinit.so has no init_plugin function' "$work/last.log"; then
			ok "smooth refuses a plugin without init_plugin"
		else
			bad "smooth on a plugin without init_plugin exited $rc, expected an error"; cat "$work/last.log" >&2
		fi
	else
		bad "could not find the maths library smooth links (ldd $smooth)"
	fi
fi

# --- mockup ----------------------------------------------------------------
# mockup maps each colour of a 192x192 image to a chunk number read from a
# mapping file of "colour number" pairs. A colour with no number after it must
# be ignored, not mapped to an uninitialised number. Uses the sample image and
# mapping shipped with mockup; SDL runs with its dummy video driver.
if [ -n "$mockup" ]; then
	mkdir "$work/mockup"
	cp "$root/tools/mockup/map.png" "$work/mockup/map.png"
	run_mockup() { # mapping file
		rm -f "$work/mockup/u7map"
		run_in "$work/mockup" env SDL_VIDEO_DRIVER=dummy "$mockup" map.png "$1"
	}

	cp "$root/tools/mockup/mappings.txt" "$work/mockup/sample.txt"
	run_mockup sample.txt
	if [ "$rc" -eq 0 ] && grep -q '^Done!' "$work/last.log" && ! grep -q 'Not expected pixel' "$work/last.log" \
		&& [ "$(wc -c < "$work/mockup/u7map")" -eq 73728 ]; then
		ok "mockup converts its sample image with its sample mapping"
	else
		bad "mockup failed (exit $rc) on its sample image and mapping"; cat "$work/last.log" >&2
	fi

	# Colour 725E0C is palette index 0 of map.png. Drop its line and end the
	# file with the colour alone.
	{ grep -iv '^725E0C ' "$root/tools/mockup/mappings.txt"; printf '725E0C\n'; } > "$work/mockup/nonumber.txt"
	run_mockup nonumber.txt
	if [ "$rc" -eq 0 ] && ! grep -q 'color 725e0c ->' "$work/last.log" \
		&& grep -q 'Not expected pixel is 00$' "$work/last.log"; then
		ok "mockup ignores a colour with no chunk number"
	else
		bad "mockup on a colour with no chunk number exited $rc or mapped it"; grep -m3 '725e0c' "$work/last.log" >&2
	fi
fi

if [ "$fail" -ne 0 ]; then
	echo "tool regressions: FAILED" >&2
	exit 1
fi
echo "tool regressions: all checks passed"
