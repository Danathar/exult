#!/usr/bin/env python3
"""Break each changed line in small ways and require a unit test to notice.

Coverage says a line ran. It does not say a test would fail if the line were
wrong. This repository has found that gap by hand four times (#59, #235, #246,
#270): code the unit tests execute but never check, so a broken copy of it
still passes every test.

This script is that hand check, run on the lines a pull request changes. For
every changed C++ file outside `tests/` that the unit build in
`tests/run-unit-tests.sh` compiles or includes, it makes one small edit at a
time to a changed line - a mutant - rebuilds the unit tests and runs them. A
mutant no test fails on is a survivor. A survivor that a reviewer has judged
harmless is listed in `tests/mutation-equivalents.txt`; any other survivor
fails the run. Files the unit build never sees (most of the engine, which
needs SDL) are skipped: no unit test could catch a mutant there.

The edits, each applied on its own:

- a comparison negated (`==` to `!=`) or moved across its boundary
  (`<` to `<=`)
- `&&` swapped with `||`
- a `!` dropped
- `true` swapped with `false`, an integer moved by one either way
- an `if` test forced to `true` and to `false`, a `while` test forced to
  `false`
- `continue` or `break` dropped
- a statement line that is not a declaration or a `return` dropped

A mutant that does not compile is not counted. A mutant counts as caught when
the build of the tests or the tests themselves fail, or run past the time
limit, and as a survivor when they pass. Before any mutant runs, the tests run
once unmutated; if that fails, nothing can be judged and the run stops.

The run never edits the checkout it is started from. It copies the tracked
files into a temporary directory, one copy per parallel job, writes each mutant
into a copy and puts the original bytes back before the next one.

With `--budget-minutes`, no mutant starts after that many minutes; the ones
left are reported as not run, so a pull request that changes many lines ends
with a verdict before the job's time limit instead of being cancelled.

Exit status: 0 when every survivor is listed, 1 when one is not, 2 when the
run could not judge (a git error, a failing baseline, a malformed equivalents
file, mutants left unrun by the budget), 130 when interrupted.
"""

import argparse
import concurrent.futures
from dataclasses import dataclass
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
EQUIVALENTS = ROOT / "tests" / "mutation-equivalents.txt"
EQUIVALENTS_NAME = "tests/mutation-equivalents.txt"
RUNNER = "tests/run-unit-tests.sh"
SUFFIXES = (".cc", ".cpp", ".h")

# The fields of one entry in the equivalents file, in the order they are
# printed. `line` is informational: the key is the file, the nearest non-blank
# line above the edit (`after`), the original text and the mutant text, so an
# entry still matches after lines move, but a listed edit to a common line
# such as `return false;` does not excuse the same edit somewhere else.
FIELDS = ("file", "line", "after", "original", "mutant", "reason")


class Unjudgeable(Exception):
    """The run cannot decide whether any mutant survives."""


@dataclass(frozen=True)
class Mutant:
    file: str
    line: int
    after: str
    original: str
    mutant: str

    def key(self):
        return (self.file, self.after, self.original, self.mutant)


def git(*args, cwd=ROOT):
    result = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Unjudgeable(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def changed_lines(base, cwd=ROOT):
    """Map each changed C++ file outside tests/ to the set of its added lines."""
    diff = git("diff", "--unified=0", "--no-color", "--no-ext-diff", f"{base}...HEAD", "--", cwd=cwd)
    changed = {}
    current = None
    for line in diff.splitlines():
        if line.startswith("+++ "):
            path = line[4:]
            current = path[2:] if path.startswith("b/") else None
            if current and (not current.endswith(SUFFIXES) or current.startswith("tests/")):
                current = None
        elif line.startswith("@@") and current:
            match = re.match(r"@@ -\S+ \+(\d+)(?:,(\d+))? @@", line)
            if match is None:
                raise Unjudgeable(f"unreadable hunk header: {line}")
            start, count = int(match.group(1)), int(match.group(2) or "1")
            if count:
                changed.setdefault(current, set()).update(range(start, start + count))
    return changed


def built_files(build_dir, root):
    """Every repository file outside tests/ named in the unit build's .d files."""
    files = set()
    root = Path(root).resolve()
    for dep in Path(build_dir).glob("*.d"):
        text = dep.read_text().replace("\\\n", " ")
        _, _, prerequisites = text.partition(":")
        for name in prerequisites.split():
            path = Path(name)
            if not path.is_absolute():
                path = Path(build_dir) / path
            try:
                relative = path.resolve().relative_to(root).as_posix()
            except ValueError:
                continue
            if not relative.startswith("tests/"):
                files.add(relative)
    return files


def mask(line):
    """The line with string and character literals and any // comment blanked.

    Offsets are kept, so a match in the masked line is a match at the same
    place in the real one.
    """
    out = []
    quote = None
    i = 0
    while i < len(line):
        char = line[i]
        if quote:
            if char == "\\" and i + 1 < len(line):
                out.append("  ")
                i += 2
                continue
            out.append(char if char == quote else " ")
            if char == quote:
                quote = None
        elif char in "\"'":
            quote = char
            out.append(char)
        elif line.startswith("//", i):
            out.append(" " * (len(line) - i))
            break
        else:
            out.append(char)
        i += 1
    return "".join(out)


OPERATORS = [
    (" == ", " != "), (" != ", " == "),
    (" < ", " <= "), (" <= ", " < "), (" > ", " >= "), (" >= ", " > "),
    (" && ", " || "), (" || ", " && "),
]

CONDITION = re.compile(r"^(\s*(?:\}\s*else\s+)?)(if|while) \((.*)\) \{$")
DECLARATION = re.compile(r"^\s*(?:const\s+|static\s+|auto\b|struct\s+|[\w:<>]+[\s*&]+\w+\s*(?:=|;|\(|\{))")


def line_mutants(text):
    """Every mutated version of one source line."""
    stripped = text.strip()
    if not stripped or stripped.startswith(("#", "//", "/*", "*")):
        return []
    masked = mask(text)
    found = []

    def at(start, length, new):
        found.append(text[:start] + new + text[start + length:])

    for old, new in OPERATORS:
        for match in re.finditer(re.escape(old), masked):
            at(match.start(), len(old), new)
    for match in re.finditer(r"!(?!=)", masked):
        at(match.start(), 1, "")
    for match in re.finditer(r"\b(true|false)\b", masked):
        at(match.start(), len(match.group(1)), "false" if match.group(1) == "true" else "true")
    for match in re.finditer(r"(?<![\w.])(\d+)(?![\w.])", masked):
        value = int(match.group(1))
        at(match.start(), len(match.group(1)), str(value + 1))
        if value > 0:
            at(match.start(), len(match.group(1)), str(value - 1))
    condition = CONDITION.match(masked)
    if condition:
        head = condition.group(1) + condition.group(2) + " ("
        forced = ["true", "false"] if condition.group(2) == "if" else ["false"]
        for value in forced:
            found.append(text[:len(head)] + value + ") {")
    if stripped in ("continue;", "break;"):
        found.append(text[:len(text) - len(text.lstrip())] + ";")
    elif (stripped.endswith(";") and not stripped.startswith(("return", "throw", "case ", "default"))
          and not DECLARATION.match(masked) and masked.count("(") == masked.count(")")):
        found.append(text[:len(text) - len(text.lstrip())] + ";")
    seen = set()
    return [m for m in found if m != text and not (m in seen or seen.add(m))]


def mutants_for(path, lines, root=ROOT):
    source = (Path(root) / path).read_text().splitlines()
    mutants = []
    for number in sorted(lines):
        if number > len(source):
            continue
        above = next((line.strip() for line in reversed(source[:number - 1]) if line.strip()), "")
        for mutated in line_mutants(source[number - 1]):
            mutants.append(Mutant(path, number, above, source[number - 1].strip(), mutated.strip()))
    return mutants


def read_equivalents(path=None):
    path = path or EQUIVALENTS
    if not path.exists():
        return {}
    entries = {}
    block = {}
    for number, line in enumerate(path.read_text().splitlines() + [""], start=1):
        if line.startswith("#"):
            continue
        if not line.strip():
            if block:
                if set(block) != set(FIELDS) or not block["reason"] or not block["original"]:
                    raise Unjudgeable(f"{EQUIVALENTS_NAME}:{number}: an entry needs {', '.join(FIELDS)} and a reason")
                entries[(block["file"], block["after"], block["original"], block["mutant"])] = block["reason"]
                block = {}
            continue
        field, sep, value = line.partition(":")
        if not sep or field not in FIELDS or field in block:
            raise Unjudgeable(f"{EQUIVALENTS_NAME}:{number}: unexpected line {line!r}")
        block[field] = value.strip()
    return entries


def copy_tree(source, target):
    """Copy the tracked files of the checkout at `source` into `target`."""
    names = git("ls-files", "-z", cwd=source).split("\0")
    for name in filter(None, names):
        src = Path(source) / name
        if src.is_file():
            dst = Path(target) / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)


def run_tests(copy, build, timeout, cxx):
    """Return "passed", "failed" or "unbuilt" for the unit tests in `copy`.

    The test binary is removed first, so a build that stops before linking
    leaves none behind: that mutant did not compile and is not counted.
    """
    binary = Path(build) / "unit-tests"
    if binary.exists():
        binary.unlink()
    env = dict(os.environ, BUILD_DIR=str(build), CXX=cxx)
    try:
        result = subprocess.run(["bash", RUNNER], cwd=copy, env=env, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return "failed" if binary.exists() else "unbuilt"
    if result.returncode == 0:
        return "passed"
    return "failed" if binary.exists() else "unbuilt"


def judge(copies, mutants, timeout, cxx, deadline=None):
    """Return (survivors, counts), running one mutant per free copy.

    `counts` maps "caught", "skipped" and "unrun" to how many mutants ended
    that way. A mutant not started by `deadline` (a time.monotonic() value)
    is unrun.
    """
    free = queue.Queue()
    for copy in copies:
        free.put(copy)

    def one(mutant):
        copy = free.get()
        if deadline is not None and time.monotonic() > deadline:
            free.put(copy)
            return mutant, "unrun"
        target = Path(copy) / mutant.file
        original = target.read_bytes()
        try:
            lines = original.decode().split("\n")
            index = mutant.line - 1
            indent = lines[index][:len(lines[index]) - len(lines[index].lstrip())]
            lines[index] = indent + mutant.mutant
            target.write_bytes("\n".join(lines).encode())
            outcome = run_tests(copy, Path(copy) / ".mutation-build", timeout, cxx)
            return mutant, {"passed": "survived", "failed": "caught", "unbuilt": "skipped"}[outcome]
        finally:
            target.write_bytes(original)
            free.put(copy)

    survivors, counts = [], {"caught": 0, "skipped": 0, "unrun": 0}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(copies)) as pool:
        for mutant, verdict in pool.map(one, mutants):
            if verdict == "survived":
                survivors.append(mutant)
            else:
                counts[verdict] += 1
    return survivors, counts


def print_entry(mutant):
    print(f"file: {mutant.file}")
    print(f"line: {mutant.line}")
    print(f"after: {mutant.after}")
    print(f"original: {mutant.original}")
    print(f"mutant: {mutant.mutant}")
    print("reason:")
    print()


def run(base, jobs, cxx, list_only=False, root=ROOT, budget_minutes=None):
    equivalents = read_equivalents()
    changed = changed_lines(base, cwd=root)
    if not changed:
        print("No changed C++ lines outside tests/; nothing to mutate.")
        return 0
    with tempfile.TemporaryDirectory(prefix="exult-mutants-") as scratch:
        copies = []
        for number in range(jobs):
            copy = Path(scratch) / f"copy{number}"
            copy_tree(root, copy)
            copies.append(copy)
        started = time.monotonic()
        if run_tests(copies[0], copies[0] / ".mutation-build", None, cxx) != "passed":
            raise Unjudgeable(f"the unmutated unit tests fail; run {RUNNER} and fix them first")
        timeout = 3 * (time.monotonic() - started) + 60
        in_build = built_files(copies[0] / ".mutation-build", copies[0])
        mutants = []
        for path in sorted(changed):
            if path not in in_build:
                print(f"skip {path}: not part of the unit build")
                continue
            mutants.extend(mutants_for(path, changed[path], root=root))
        print(f"{len(mutants)} mutants in {len([p for p in changed if p in in_build])} file(s)")
        if list_only:
            for mutant in mutants:
                print(f"{mutant.file}:{mutant.line}: {mutant.mutant}")
            return 0
        if not mutants:
            return 0
        deadline = time.monotonic() + 60 * budget_minutes if budget_minutes else None
        survivors, counts = judge(copies, mutants, timeout, cxx, deadline)
    unlisted = [m for m in survivors if m.key() not in equivalents]
    print(f"caught {counts['caught']}, survived {len(survivors)} ({len(survivors) - len(unlisted)} listed), "
          f"did not compile {counts['skipped']}, not run {counts['unrun']}")
    if unlisted:
        print(f"\n{len(unlisted)} survivor(s) not in {EQUIVALENTS_NAME}. Add a test that fails on each,")
        print("or, if no test should, copy its block there and write the reason:\n")
        for mutant in unlisted:
            print_entry(mutant)
        return 1
    if counts["unrun"]:
        raise Unjudgeable(f"{counts['unrun']} mutant(s) were not run within {budget_minutes} minutes")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="origin/master", help="compare HEAD with this ref (default: origin/master)")
    parser.add_argument("--jobs", type=int, default=min(4, os.cpu_count() or 1), help="parallel copies")
    parser.add_argument("--list", action="store_true", help="print the mutants without running them")
    parser.add_argument("--budget-minutes", type=float, help="start no mutant after this long (default: no limit)")
    args = parser.parse_args(argv)
    cxx = os.environ.get("CXX", "g++")
    try:
        return run(args.base, max(1, args.jobs), cxx, list_only=args.list, budget_minutes=args.budget_minutes)
    except Unjudgeable as error:
        print(f"mutate_changed: {error}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
