#!/usr/bin/env python3
"""Tests for tests/mutate_changed.py.

Run with `python3 -B -m unittest discover -s tests -p 'test_mutate_changed.py'`.
"""

import importlib.util
import io
from pathlib import Path
import contextlib
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parent / "mutate_changed.py"
spec = importlib.util.spec_from_file_location("mutate_changed", SCRIPT)
mc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mc)


def git(cwd, *args):
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd, check=True,
                   capture_output=True)


class Repo:
    """A throwaway git repository with one commit on `base`."""

    def __init__(self, files):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name)
        git(self.path, "init", "-q", "-b", "base")
        self.write(files)
        git(self.path, "add", "-A")
        git(self.path, "commit", "-q", "-m", "base")

    def write(self, files):
        for name, text in files.items():
            target = self.path / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)

    def commit(self, files):
        self.write(files)
        git(self.path, "add", "-A")
        git(self.path, "commit", "-q", "-m", "change")

    def close(self):
        self.dir.cleanup()


class ChangedLines(unittest.TestCase):
    def setUp(self):
        self.repo = Repo({"a.cc": "one\ntwo\nthree\n", "tests/t.cc": "x\n", "notes.txt": "n\n"})
        self.addCleanup(self.repo.close)

    def test_added_and_edited_lines_of_cpp_outside_tests(self):
        self.repo.commit({"a.cc": "one\nTWO\nthree\nfour\n", "tests/t.cc": "y\n", "notes.txt": "m\n",
                          "b.h": "h1\nh2\n"})
        self.assertEqual(mc.changed_lines("base~0", cwd=self.repo.path), {})
        git(self.repo.path, "branch", "-f", "start", "HEAD~1")
        self.assertEqual(mc.changed_lines("start", cwd=self.repo.path), {"a.cc": {2, 4}, "b.h": {1, 2}})

    def test_deleted_lines_only_give_nothing(self):
        git(self.repo.path, "branch", "start")
        self.repo.commit({"a.cc": "one\nthree\n"})
        self.assertEqual(mc.changed_lines("start", cwd=self.repo.path), {})

    def test_hooks_count_but_not_their_tests_or_other_scripts(self):
        git(self.repo.path, "branch", "start")
        self.repo.commit({".claude/hooks/guard.mjs": "a\nb\n", ".claude/hooks/tests/guard.test.mjs": "t\n",
                          "scripts/tool.mjs": "s\n"})
        self.assertEqual(mc.changed_lines("start", cwd=self.repo.path), {".claude/hooks/guard.mjs": {1, 2}})

    def test_unknown_base_cannot_be_judged(self):
        with self.assertRaises(mc.Unjudgeable):
            mc.changed_lines("no-such-ref", cwd=self.repo.path)


class BuiltFiles(unittest.TestCase):
    def test_reads_prerequisites_outside_tests(self):
        with tempfile.TemporaryDirectory() as root:
            build = Path(root) / "build"
            build.mkdir()
            for name in ("files/utils.cc", "files/utils.h", "tests/unit/harness.h"):
                (Path(root) / name).parent.mkdir(parents=True, exist_ok=True)
                (Path(root) / name).write_text("")
            (build / "utils.cc.d").write_text(
                f"{build}/utils.cc.o: {root}/files/utils.cc \\\n {root}/files/utils.h \\\n"
                f" {root}/tests/unit/harness.h /usr/include/stdio.h\n")
            self.assertEqual(mc.built_files(build, root), {"files/utils.cc", "files/utils.h"})


class CopyTree(unittest.TestCase):
    """The hook tests run git in the copy: `git ls-files`, and the push target's `origin`."""

    def setUp(self):
        self.repo = Repo({".gitignore": "*.log\n", "a.txt": "a\n", "docs/b.md": "b\n"})
        self.addCleanup(self.repo.close)
        self.repo.write({"kept.log": "k\n"})
        git(self.repo.path, "add", "-f", "kept.log")
        git(self.repo.path, "commit", "-q", "-m", "tracked but ignored")
        (self.repo.path / "untracked.txt").write_text("u\n")
        self.copy = tempfile.TemporaryDirectory()
        self.addCleanup(self.copy.cleanup)
        self.target = Path(self.copy.name) / "copy"

    def ls_files(self, path):
        return subprocess.run(["git", "ls-files"], cwd=path, check=True, capture_output=True,
                              text=True).stdout.split()

    def test_copy_tracks_the_same_files_and_keeps_origin(self):
        git(self.repo.path, "remote", "add", "origin", "https://github.com/example/repo")
        mc.copy_tree(self.repo.path, self.target)
        self.assertEqual(self.ls_files(self.target), [".gitignore", "a.txt", "docs/b.md", "kept.log"])
        self.assertFalse((self.target / "untracked.txt").exists())
        origin = subprocess.run(["git", "remote", "get-url", "origin"], cwd=self.target, capture_output=True,
                                text=True)
        self.assertEqual(origin.stdout.strip(), "https://github.com/example/repo")

    def test_copy_of_a_checkout_without_origin_has_no_remote(self):
        mc.copy_tree(self.repo.path, self.target)
        self.assertEqual(self.ls_files(self.target), [".gitignore", "a.txt", "docs/b.md", "kept.log"])
        remotes = subprocess.run(["git", "remote"], cwd=self.target, check=True, capture_output=True, text=True)
        self.assertEqual(remotes.stdout, "")


class Mask(unittest.TestCase):
    def test_blanks_literals_and_comments_keeping_offsets(self):
        line = 'if (a == "x == y" && c == \'!\') { // b == c'
        masked = mc.mask(line)
        self.assertEqual(len(masked), len(line))
        self.assertEqual(masked.count("=="), 2)
        self.assertNotIn("!", masked)

    def test_escaped_quote_stays_inside_the_literal(self):
        self.assertEqual(mc.mask(r'"a\" == b" == c').count("=="), 1)


class LineMutants(unittest.TestCase):
    def test_comparisons_logic_and_literals(self):
        got = mc.line_mutants("\tif (a == b && !c) {")
        self.assertIn("\tif (a != b && !c) {", got)
        self.assertIn("\tif (a == b || !c) {", got)
        self.assertIn("\tif (a == b && c) {", got)
        self.assertIn("\tif (true) {", got)
        self.assertIn("\tif (false) {", got)

    def test_boundaries_move_both_ways(self):
        self.assertEqual(set(mc.line_mutants("\tx = a < b;")), {"\tx = a <= b;", "\t;"})
        self.assertIn("\tx = a > b;", mc.line_mutants("\tx = a >= b;"))

    def test_shift_and_template_brackets_are_not_comparisons(self):
        self.assertEqual(mc.line_mutants("\tstd::vector<int> v;"), [])
        self.assertEqual(mc.line_mutants('\tstd::cerr << "x" << std::endl;'), ["\t;"])

    def test_integers_and_booleans(self):
        self.assertEqual(set(mc.line_mutants("\treturn 0;")), {"\treturn 1;"})
        self.assertEqual(set(mc.line_mutants("\treturn 2;")), {"\treturn 3;", "\treturn 1;"})
        self.assertEqual(mc.line_mutants("\treturn true;"), ["\treturn false;"])

    def test_identifiers_with_digits_are_left_alone(self):
        self.assertEqual(mc.line_mutants("\tsha1_update(x2);"), ["\t;"])

    def test_while_is_forced_false_only(self):
        got = mc.line_mutants("\twhile (pos <= size) {")
        self.assertIn("\twhile (false) {", got)
        self.assertNotIn("\twhile (true) {", got)

    def test_continue_and_break_are_dropped(self):
        self.assertEqual(mc.line_mutants("\t\tcontinue;"), ["\t\t;"])
        self.assertEqual(mc.line_mutants("\t\tbreak;"), ["\t\t;"])

    def test_declarations_returns_and_comments_are_not_dropped(self):
        self.assertEqual(mc.line_mutants("\tconst string part = name;"), [])
        self.assertEqual(mc.line_mutants("\tDIR* dir = opendir(x);"), [])
        self.assertEqual(mc.line_mutants("\tstruct stat sbuf;"), [])
        self.assertEqual(mc.line_mutants("\t// a == b"), [])
        self.assertEqual(mc.line_mutants("#if A == 1"), [])
        self.assertEqual(mc.line_mutants(" *  a == b"), [])

    def test_assignment_and_call_statements_are_dropped(self):
        self.assertEqual(mc.line_mutants("\tname = resolved;"), ["\t;"])
        self.assertEqual(mc.line_mutants("\tclosedir(dir);"), ["\t;"])


class JsLineMutants(unittest.TestCase):
    def test_strict_comparisons_and_forced_if(self):
        self.assertEqual(set(mc.js_line_mutants("    if (a === '--repo' || a !== '-R') values.push(x);")), {
            "    if (a !== '--repo' || a !== '-R') values.push(x);",
            "    if (a === '--repo' || a === '-R') values.push(x);",
            "    if (true) values.push(x);",
            "    if (false) values.push(x);",
        })

    def test_booleans(self):
        self.assertEqual(set(mc.js_line_mutants("        if (allowed === true) return null;")), {
            "        if (allowed !== true) return null;",
            "        if (allowed === false) return null;",
            "        if (true) return null;",
            "        if (false) return null;",
        })

    def test_array_string_entries_are_dropped(self):
        self.assertEqual(set(mc.js_line_mutants("    if (['secret', 'variable'].includes(group)) {")), {
            "    if (['variable'].includes(group)) {",
            "    if (['secret'].includes(group)) {",
            "    if (true) {",
            "    if (false) {",
        })
        self.assertEqual(set(mc.js_line_mutants("    pr: ['view', 'list'],")),
                         {"    pr: ['list'],", "    pr: ['view'],"})
        self.assertEqual(mc.js_line_mutants("    only: ['x'],"), ["    only: [],"])
        self.assertEqual(mc.js_line_mutants("        'view',"), ["        "])

    def test_strings_outside_arrays_are_kept(self):
        self.assertEqual(mc.js_line_mutants("    f('a', b);"), [])
        self.assertEqual(mc.js_line_mutants("    x = { a: 'b' };"), [])

    def test_return_block_is_dropped(self):
        self.assertEqual(mc.js_line_mutants("        return block('Blocked: x === y');"),
                         ["        void ('Blocked: x === y');"])
        self.assertEqual(mc.js_line_mutants("    return block("), ["    void ("])
        self.assertEqual(mc.js_line_mutants("        return block(`Blocked: ${a === b}`);"),
                         ["        void (`Blocked: ${a === b}`);"])

    def test_comments_are_left_alone(self):
        self.assertEqual(mc.js_line_mutants("    // a === b"), [])
        self.assertEqual(mc.js_line_mutants(" * a === true"), [])

    def test_hook_files_use_the_js_edits(self):
        with tempfile.TemporaryDirectory() as root:
            hook = Path(root) / ".claude/hooks/g.mjs"
            hook.parent.mkdir(parents=True)
            hook.write_text("function f(a) {\n    return a === 1;\n}\n")
            got = mc.mutants_for(".claude/hooks/g.mjs", {2}, root=root)
        self.assertEqual([m.mutant for m in got], ["return a !== 1;"])


class Equivalents(unittest.TestCase):
    def read(self, text):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "eq.txt"
            path.write_text(text)
            return mc.read_equivalents(path)

    def test_reads_entries_and_skips_comments(self):
        got = self.read("# note\n\nfile: a.cc\nline: 3\nafter: {\noriginal: x;\nmutant: ;\nreason: dead store\n")
        self.assertEqual(got, {("a.cc", "{", "x;", ";"): "dead store"})

    def test_entry_without_reason_cannot_be_judged(self):
        with self.assertRaises(mc.Unjudgeable):
            self.read("file: a.cc\nline: 3\nafter: {\noriginal: x;\nmutant: ;\nreason:\n")

    def test_unknown_or_repeated_field_cannot_be_judged(self):
        with self.assertRaises(mc.Unjudgeable):
            self.read("file: a.cc\nfile: b.cc\n")
        with self.assertRaises(mc.Unjudgeable):
            self.read("colour: red\n")

    def test_missing_file_is_empty(self):
        self.assertEqual(mc.read_equivalents(Path("/nonexistent/eq.txt")), {})

    def test_shipped_file_parses(self):
        mc.read_equivalents()


class Run(unittest.TestCase):
    """run() over a temp repository, with the unit build replaced by a stub."""

    SOURCE = "int f(int a) {\n\treturn a;\n}\n"

    def setUp(self):
        self.repo = Repo({"files/f.cc": self.SOURCE, "tests/run-unit-tests.sh": "true\n"})
        self.addCleanup(self.repo.close)
        git(self.repo.path, "branch", "start")
        self.saved = (mc.run_tests, mc.built_files, mc.EQUIVALENTS)
        self.addCleanup(self.restore)
        mc.EQUIVALENTS = self.repo.path / "eq.txt"
        mc.built_files = lambda build, root: {"files/f.cc"}

    def restore(self):
        mc.run_tests, mc.built_files, mc.EQUIVALENTS = self.saved

    def stub(self, verdict, baseline="passed"):
        calls = []

        def run_tests(copy, build, timeout, cxx):
            text = (Path(copy) / "files/f.cc").read_text()
            calls.append(text)
            return baseline if len(calls) == 1 else verdict(text)

        mc.run_tests = run_tests
        return calls

    def run_quiet(self, **kw):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            code = mc.run("start", 1, "c++", root=self.repo.path, **kw)
        return code, out.getvalue()

    def test_nothing_changed_exits_0_without_building(self):
        calls = self.stub(lambda text: "passed")
        self.assertEqual(self.run_quiet()[0], 0)
        self.assertEqual(calls, [])

    def test_caught_mutant_exits_0_and_checkout_is_untouched(self):
        self.repo.commit({"files/f.cc": "int f(int a) {\n\treturn a == 1;\n}\n"})
        calls = self.stub(lambda text: "failed")
        self.assertEqual(self.run_quiet()[0], 0)
        self.assertIn("\treturn a != 1;", calls[1])
        self.assertEqual((self.repo.path / "files/f.cc").read_text(), "int f(int a) {\n\treturn a == 1;\n}\n")

    def test_unlisted_survivor_exits_1_and_prints_its_entry(self):
        self.repo.commit({"files/f.cc": "int f(int a) {\n\treturn a == 1;\n}\n"})
        self.stub(lambda text: "passed" if "!=" in text else "failed")
        code, out = self.run_quiet()
        self.assertEqual(code, 1)
        self.assertIn("file: files/f.cc\nline: 2\nafter: int f(int a) {\noriginal: return a == 1;\n"
                      "mutant: return a != 1;\nreason:\n", out)

    def test_listed_survivor_exits_0(self):
        self.repo.commit({"files/f.cc": "int f(int a) {\n\treturn a == 1;\n}\n"})
        mc.EQUIVALENTS.write_text("file: files/f.cc\nline: 9\nafter: int f(int a) {\noriginal: return a == 1;\n"
                                  "mutant: return a != 1;\nreason: test\n")
        self.stub(lambda text: "passed" if "!=" in text else "failed")
        self.assertEqual(self.run_quiet()[0], 0)

    def test_listed_edit_does_not_excuse_the_same_edit_after_another_line(self):
        self.repo.commit({"files/f.cc": "int f(int a) {\n\treturn a == 1;\n}\n"})
        mc.EQUIVALENTS.write_text("file: files/f.cc\nline: 2\nafter: int g(int a) {\noriginal: return a == 1;\n"
                                  "mutant: return a != 1;\nreason: test\n")
        self.stub(lambda text: "passed" if "!=" in text else "failed")
        self.assertEqual(self.run_quiet()[0], 1)

    def test_mutant_that_does_not_build_is_not_a_survivor(self):
        self.repo.commit({"files/f.cc": "int f(int a) {\n\treturn a == 1;\n}\n"})
        self.stub(lambda text: "unbuilt")
        code, out = self.run_quiet()
        self.assertEqual(code, 0)
        self.assertIn("did not compile 3", out)

    def test_failing_baseline_cannot_be_judged(self):
        self.repo.commit({"files/f.cc": "int f(int a) {\n\treturn a == 1;\n}\n"})
        self.stub(lambda text: "failed", baseline="failed")
        with self.assertRaises(mc.Unjudgeable):
            self.run_quiet()

    def test_budget_spent_leaves_mutants_unrun_and_cannot_be_judged(self):
        self.repo.commit({"files/f.cc": "int f(int a) {\n\treturn a == 1;\n}\n"})
        calls = self.stub(lambda text: "failed")
        with self.assertRaises(mc.Unjudgeable) as raised:
            self.run_quiet(budget_minutes=-1)
        self.assertIn("3 mutant(s) were not run", str(raised.exception))
        self.assertEqual(len(calls), 1)

    def test_survivor_found_before_the_budget_still_exits_1(self):
        self.repo.commit({"files/f.cc": "int f(int a) {\n\treturn a == 1;\n}\n"})
        self.stub(lambda text: "passed")
        saved = mc.judge

        def judge(copies, mutants, timeout, cxx, deadline):
            survivors, counts = saved(copies, mutants[:1], timeout, cxx, None)
            counts["unrun"] = len(mutants) - 1
            return survivors, counts

        mc.judge = judge
        self.addCleanup(setattr, mc, "judge", saved)
        code, out = self.run_quiet(budget_minutes=1)
        self.assertEqual(code, 1)
        self.assertIn("not run 2", out)

    def test_file_outside_the_unit_build_is_skipped(self):
        self.repo.commit({"engine.cc": "int g() {\n\treturn 1 == 1;\n}\n"})
        calls = self.stub(lambda text: "passed")
        code, out = self.run_quiet()
        self.assertEqual(code, 0)
        self.assertIn("skip engine.cc: not part of the unit build", out)
        self.assertEqual(len(calls), 1)

    def test_main_maps_unjudgeable_to_2(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(mc.main(["--base", "no-such-ref"]), 2)


class HookRun(unittest.TestCase):
    """run() over a changed hook, with the node tests replaced by a stub."""

    HOOK = ".claude/hooks/g.mjs"

    def setUp(self):
        self.repo = Repo({self.HOOK: "export function f(a) {\n    return a;\n}\n"})
        self.addCleanup(self.repo.close)
        git(self.repo.path, "branch", "start")
        self.repo.commit({self.HOOK: "export function f(a) {\n    return a === 1;\n}\n"})
        self.saved = (mc.run_tests, mc.run_hook_tests, mc.EQUIVALENTS)
        self.addCleanup(self.restore)
        mc.EQUIVALENTS = self.repo.path / "eq.txt"
        self.cpp_calls = []
        mc.run_tests = lambda *args: self.cpp_calls.append(args) or "passed"

    def restore(self):
        mc.run_tests, mc.run_hook_tests, mc.EQUIVALENTS = self.saved

    def stub(self, verdict):
        calls = []

        def run_hook_tests(copy, timeout, file=None):
            text = (Path(copy) / self.HOOK).read_text()
            calls.append(text)
            return "passed" if len(calls) == 1 else verdict(text)

        mc.run_hook_tests = run_hook_tests
        return calls

    def run_quiet(self, node="/usr/bin/node"):
        with mock.patch.object(mc.shutil, "which", lambda name: node):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                code = mc.run("start", 1, "c++", root=self.repo.path)
        return code, out.getvalue()

    def test_hook_survivor_exits_1_without_the_unit_build(self):
        calls = self.stub(lambda text: "passed" if "!==" in text else "failed")
        code, out = self.run_quiet()
        self.assertEqual(code, 1)
        self.assertIn(f"file: {self.HOOK}\nline: 2\nafter: export function f(a) {{\n"
                      "original: return a === 1;\nmutant: return a !== 1;\nreason:\n", out)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.cpp_calls, [])

    def test_caught_hook_mutant_exits_0(self):
        self.stub(lambda text: "failed")
        self.assertEqual(self.run_quiet()[0], 0)

    def test_hooks_are_skipped_without_node(self):
        calls = self.stub(lambda text: "passed")
        code, out = self.run_quiet(node=None)
        self.assertEqual(code, 0)
        self.assertIn(f"skip {self.HOOK}: node is not installed", out)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
