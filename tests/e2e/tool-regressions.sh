#!/usr/bin/env bash
# Regression checks for the command-line tools expack, textpack and ipack, using
# only data created here (no Ultima VII game data). Called by tests/e2e/run.sh,
# which builds the tools; it can also be run on its own:
#
#   EXULT_EXPACK=/path/expack [EXULT_TEXTPACK=/path/textpack] [EXULT_IPACK=/path/ipack] \
#       tests/e2e/tool-regressions.sh
#
# A tool whose path is empty or unset is skipped. Every invocation is wrapped in
# `timeout` so that a hang is reported as a failure instead of stalling the job.
set -uo pipefail

expack="${EXULT_EXPACK:-}"
textpack="${EXULT_TEXTPACK:-}"
ipack="${EXULT_IPACK:-}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail=0
ok() { echo "ok   - $1"; }
bad() { echo "FAIL - $1" >&2; fail=1; }

# Run a command with a time limit, capturing output in $work/last.log and the
# exit status in $rc. run_in does the same from inside the given directory.
rc=0
run_in() { # dir command...
	local dir=$1
	shift
	rc=0
	(cd "$dir" && timeout 30 "$@") >"$work/last.log" 2>&1 || rc=$?
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

if [ "$fail" -ne 0 ]; then
	echo "tool regressions: FAILED" >&2
	exit 1
fi
echo "tool regressions: all checks passed"
