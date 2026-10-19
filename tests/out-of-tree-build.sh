#!/usr/bin/env bash
# Out-of-tree build from a read-only source tree (Danathar/exult#75).
#
# Copies the checkout's tracked files (and, unless WITH_GIT=0, a clone of its
# git metadata so the gitinfo.h rule runs), runs autoreconf in the copy, makes
# the copy read-only, then configures and builds in a separate directory with
# the data files, mods and usecode compiler enabled. A rule that writes into
# $(srcdir) fails the build. Afterwards it checks that the generated files are
# in the build tree, that `make install` finds them there, that `make` refuses
# to build while stale generated headers sit in the source tree, and that
# `make maintainer-clean` removes every file the build created. (maintainer-clean
# rather than distclean: from a git checkout the build also generates the ucc
# parser sources, which a release tarball ships and only maintainer-clean removes.)
#
# Run it as a non-root user: root ignores the read-only permission bits, so the
# script refuses to run when the copy stays writable.
#
# Usage:
#   tests/out-of-tree-build.sh [extra configure options...]
#   WITH_GIT=0 tests/out-of-tree-build.sh   # source tree without .git (like a tarball)
#
# Environment: JOBS (make -j, default nproc), WORK_DIR (default: a new
# directory under ${TMPDIR:-/tmp}, removed on exit unless KEEP=1).
# Needs the Exult build dependencies (see tests/README.md) and git.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
jobs="${JOBS:-$(nproc)}"
with_git="${WITH_GIT:-1}"
work="${WORK_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/exult-out-of-tree.XXXXXX")}"
src="$work/src"
build="$work/build"
inst="$work/inst"

cleanup() {
	chmod -R u+w "$work" 2>/dev/null || true
	if [ -z "${KEEP:-}" ]; then
		rm -rf "$work"
	fi
}
trap cleanup EXIT

fail=0
ok() { echo "ok   - $1"; }
bad() {
	echo "FAIL - $1" >&2
	fail=1
}

mkdir -p "$src" "$build"
if [ "$with_git" = 1 ]; then
	# Committed history only; the working-tree files are copied over it below.
	git clone --quiet --local --no-checkout "$root" "$src"
fi
(cd "$root" && git ls-files -z) | (cd "$root" && tar --null -T - -cf -) | tar -C "$src" -xf -
(cd "$src" && autoreconf -i >/dev/null 2>&1)

chmod -R a-w "$src"
if (: >"$src/.write-probe") 2>/dev/null; then
	echo "the source copy is still writable (running as root?); run as a normal user" >&2
	exit 2
fi

echo "== configure"
(cd "$build" && "$src/configure" --enable-data --enable-mods --enable-compiler "$@" >"$work/configure.log" 2>&1) || {
	tail -40 "$work/configure.log" >&2
	exit 1
}
echo "== make"
if make -C "$build" -j"$jobs" >"$work/make.log" 2>&1; then
	ok "make succeeds with a read-only source tree"
else
	grep -E 'Error|error:|Permission denied|\*\*\*' "$work/make.log" | head -40 >&2 || tail -40 "$work/make.log" >&2
	bad "make failed with a read-only source tree"
	exit 1
fi

for f in data/exult.flx data/exult_flx.h data/exult_bg.flx data/exult_si.flx data/bg/introsfx_mt32_flx.h \
	content/bgkeyring/data/usecode content/bgkeyring/data/shapes.vga content/sifixes/data/usecode; do
	if [ -s "$build/$f" ]; then
		ok "built $f in the build tree"
	else
		bad "$f is missing from the build tree"
	fi
done
if [ "$with_git" = 1 ]; then
	if grep -q "GIT_REVISION \"$(git -C "$src" rev-parse HEAD)\"" "$build/gitinfo.h" 2>/dev/null; then
		ok "gitinfo.h is generated in the build tree from the source tree's git data"
	else
		bad "gitinfo.h is missing from the build tree or names the wrong revision"
	fi
fi

echo "== make install"
if make -C "$build" install DESTDIR="$inst" >"$work/install.log" 2>&1; then
	ok "make install succeeds"
	for f in exult.flx exult_bg.flx exult_si.flx midisfx.flx; do
		if [ -n "$(find "$inst" -path "*/exult/$f" -type f -size +0)" ]; then
			ok "installed $f"
		else
			bad "$f was not installed"
		fi
	done
else
	tail -40 "$work/install.log" >&2
	bad "make install failed"
fi

echo "== stale generated headers in the source tree"
# A header left in the source tree by an earlier in-tree build would be found by
# quoted includes before this build's copy; make must refuse rather than use it.
chmod u+w "$src" "$src/data"
: >"$src/gitinfo.h"
: >"$src/data/exult_flx.h"
chmod a-w "$src" "$src/data"
if make -C "$build" >"$work/stale.log" 2>&1; then
	bad "make builds although stale generated headers sit in the source tree"
elif grep -qF "$src/gitinfo.h" "$work/stale.log" && grep -qF "$src/data/exult_flx.h" "$work/stale.log"; then
	ok "make refuses to build while stale generated headers sit in the source tree"
else
	tail -20 "$work/stale.log" >&2
	bad "make failed without naming the stale generated headers"
fi
chmod u+w "$src" "$src/data"
rm -f "$src/gitinfo.h" "$src/data/exult_flx.h"
chmod a-w "$src" "$src/data"

echo "== make maintainer-clean"
if make -C "$build" maintainer-clean >"$work/clean.log" 2>&1; then
	left="$(cd "$build" && find . -type f | sort)"
	if [ -z "$left" ]; then
		ok "make maintainer-clean removes every generated file"
	else
		echo "$left" >&2
		bad "make maintainer-clean left files in the build tree"
	fi
else
	tail -40 "$work/clean.log" >&2
	bad "make maintainer-clean failed"
fi

exit "$fail"
