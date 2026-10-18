# PR review rubric

How changes to `Danathar/exult` are reviewed. For the owner, for agents
reviewing, and for agents checking their own work before opening a PR. Exult is
a C++17 engine whose users have decades of savegames, so the first questions
are what the change could silently corrupt or break, then whether it builds
everywhere. Review in the order below; the first section that fails is the one
to fix. Where this page and [AGENTS.md](../AGENTS.md) disagree, AGENTS.md wins.

## Severity levels

Findings use `P0`-`P3` (the badges the Codex review connector can attach), so a
human, an agent and a bot describe a finding the same way. Bot findings are
advisory: verify each against the code, reply with the reasoning, resolve the
thread either way.

| level | meaning | merge? |
|---|---|---|
| P0 | Ultima VII game data or other copyrighted asset, a credential, or a licence violation enters the repo; a change that corrupts or silently discards existing savegames; a memory-safety bug reachable from game or savegame data (out-of-bounds read/write, use after free); a PR aimed at upstream `exult/exult` | Never. Fix first, even if CI is green |
| P1 | Wrong behaviour players will hit: savegame or data-file format changed without compatibility handling, usecode semantics for BG/SI changed, a platform build broken, a crash on a common path, a large per-frame slowdown | Not until fixed, or the owner accepts the risk in the PR thread |
| P2 | Real but narrow: missing test for an error path, wrong message, a leak on one path, undefined-behaviour risk that needs unusual input | Fix in the PR, or reply why it does not apply |
| P3 | Style, naming, comment wording, docs phrasing | Optional; do not block |

## 1. Scope, tier and fork rules

- [ ] One concern per PR, sized to the problem; no drive-by reformatting
      (see `.clang-format`).
- [ ] The PR targets `Danathar/exult` `master`, and nothing in it or its text
      asks for action on `exult/exult`.
- [ ] Risk tier identified ([risk-tiers.md](risk-tiers.md)): reviewed at the
      depth of the most sensitive path touched. Tier 3 needs the owner.
- [ ] No game data or copyrighted assets (`static/`, `gamedat/`, original
      `*.flx`, extracted sprites or music) and no credentials.
- [ ] `COPYING` untouched; copied-in code carries a compatible licence.

## 2. Savegame and file-format compatibility

- [ ] Reading and writing code for savegames (`gamedat`, `objs/`
      serialization, `files/`) and Exult's data files keeps old files readable.
      A format change has a version/compat path and a note in the PR.
- [ ] Field widths, endianness and struct packing are explicit, not inherited
      from the compiler or host (32/64-bit, big-endian ports exist).
- [ ] Round trip is tested where possible: write then read gives the same state.

## 3. Usecode and game behaviour

- [ ] Changes to the usecode interpreter (`usecode/`), intrinsics or the
      `ucc` compiler keep results for original BG and SI scripts unchanged,
      or the PR says exactly what differs and why.
- [ ] Intrinsic numbering and argument counts match what the shipped usecode
      and mods call (see `docs/exult_intrinsics.txt`).
- [ ] Gameplay changes that are not bug fixes are optional via `exult.cfg`
      and default to original behaviour.

## 4. Cross-platform builds

- [ ] Builds with autotools on Linux with gcc and clang. For build-system
      changes (`configure.ac`, `Makefile.am`, `*.mk`, CMake, MSVC project
      files) the other platform files are updated too, or the PR says which
      were not.
- [ ] No new platform-specific API without a guard; no assumption of `char`
      signedness, `long` size or `/` path separators.
- [ ] New source files are added to every build system that lists sources.
- [ ] C++17 only; no compiler extensions the other platforms lack.
- [ ] Upstream's `ci-*.yml` matrix (Linux, macOS, Windows MinGW/MSVC, Android,
      iOS, FreeBSD, OmniOS) is the reference; say which ran on the PR.

## 5. Performance

- [ ] Code on the render and game-loop paths (per frame, per object) does not
      add allocation, copying, locking or logging; hoist or cache.
- [ ] Containers and strings are reserved/moved, not copied, in hot paths.
- [ ] A claimed optimisation has a measurement in the PR.

## 6. Memory safety and correctness

- [ ] Sizes and indexes read from files or usecode are validated before use.
- [ ] Ownership is clear (smart pointers or an existing owner); no raw
      `new`/`delete` pairs split across functions, no dangling references to
      objects removed from the world.
- [ ] No signed overflow, uninitialised reads, or shifts by the type width.
- [ ] Error paths release what they acquired; failures are reported, not
      ignored.
- [ ] Compiler warnings are not increased.

## 7. Tests

- [ ] New behaviour has a test that fails without the change; a bug fix has the
      test that would have caught it. Entry points: `tests/run-unit-tests.sh`,
      `tests/e2e/run.sh`.
- [ ] Tests assert observable outcomes, not that a function ran, and do not
      need Ultima VII game data.
- [ ] Required checks are green and the branch is current with `master`; see
      [quality.md](quality.md).
- [ ] The PR states what was not tested (platform, game, mod).

## 8. Housekeeping

- [ ] Commits are signed off (`-s`); PR body has one `Closes #N` per issue.
- [ ] Docs, `ChangeLog` or `README` updated for user-visible changes.
- [ ] Workflows: top-level `permissions:` minimal, third-party actions pinned
      to a commit SHA, no `pull_request_target` with write rights, event strings
      passed via `env:`; every `gh` write command names `--repo Danathar/exult`.
- [ ] No generated or local files committed.

## Reviewing agent PRs (Hive and others)

- The agent's report is a claim, not evidence: check the commands it says it
  ran against the CI result and the diff.
- Hive PRs are opened by `app/danathar-atomic-hive` and end with a signature
  line; they get the same rubric as human PRs. Their outcomes are the "Hive app"
  row of [metrics.md](metrics.md).
- A PR that widens what an agent may do (workflows, `.claude/settings.json`,
  hooks, rulesets) is reviewed at the highest tier whatever its size.
- Do not push to a contributor's branch; comment instead.
