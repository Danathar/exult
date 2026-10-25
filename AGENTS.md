# AGENTS.md

Authoritative instructions for every AI coding agent working in this repository
(Claude Code, GitHub Copilot, Cursor, Codex, others). The tool-specific files
([CLAUDE.md](CLAUDE.md), [.github/copilot-instructions.md](.github/copilot-instructions.md),
[.cursor/rules/exult.mdc](.cursor/rules/exult.mdc)) only point here and repeat
the critical rules. If they disagree with this file, this file wins.

## Fork rule (hard rule)

This is `Danathar/exult`, a fork of upstream `exult/exult`. Only `origin`
(`https://github.com/Danathar/exult`) is configured; there is no upstream
remote and agents must not add one.

- Everything goes to **`Danathar/exult`**: issues, branches, pull requests and
  comments. Never open an issue, PR or comment on `exult/exult`.
- `gh` picks its target repository from the clone's remotes and a per-clone
  default, and that default can be the parent (for example after
  `gh repo clone` of a fork). Do not rely on it: **every `gh` write command
  passes `--repo Danathar/exult`**,
  and PRs use `gh pr create --repo Danathar/exult --base master --head <branch>`.
- The default branch is `master`.
- Syncing from upstream is the owner's job, not an agent's (see
  `.claude/skills/sync-from-upstream/SKILL.md`). Porting a specific upstream
  change into the fork is allowed only as an ordinary PR to `Danathar/exult`
  (see `.github/prompts/port-upstream-commit.prompt.md`).
- Agents do not merge PRs, edit repository settings or rulesets, or add
  labels beyond what a workflow creates. The owner's Hive (the
  `danathar-atomic-hive[bot]` GitHub App) merges one PR at a time
  (`hive-serialized`) after the required checks pass.

## What Exult is

Exult is a GPL-2.0-or-later, C++17, autotools game engine for *Ultima VII*
(The Black Gate and Serpent Isle). It needs the player's own copy of the
original game files. See [README.md](README.md) and [FAQ](FAQ).

Main source layout (engine sources live in the repository root):

| Path | What it holds |
|---|---|
| `*.cc`, `*.h` (root) | Engine core: `exult.cc` (main loop), `gamewin.cc` (game window), `actors.cc`, `schedule.cc`, `combat.cc`, `gamemap.cc`, `gamedat.cc` (save/load of game state), `shapeid.cc`, ... |
| `objs/` | Game object classes (containers, chunks, barges, ...) and their serialization |
| `gumps/` | In-game UI windows and widgets |
| `usecode/` | The usecode virtual machine, intrinsics and debugger hooks |
| `shapes/` | Shape/frame (`.vga`, `.shp`) loading, writing and shape info |
| `files/` | File I/O: Flex archives, `utils`, endian I/O, zip, sha1 |
| `conf/` | XML configuration (`exult.cfg`) |
| `audio/` | Audio mixer, MIDI drivers, sound effects |
| `imagewin/` | Image window and scalers |
| `pathfinder/` | A* and other path finders |
| `gamemgr/` | Per-game setup (`bggame.cc`, `sigame.cc`) and mod manager |
| `flic/`, `server/` | FLI playback; Exult Studio server protocol |
| `mapedit/` | Exult Studio, the GTK map/shape editor (`exult_studio`) |
| `tools/` | Command-line tools: `expack`, `ipack`, `shp2pcx`, `splitshp`, `textpack`, the usecode compiler `tools/compiler` (`ucc`) and decompiler `tools/ucxt`, GIMP and Aseprite plugins |
| `content/` | Mods and sample content built with Exult Studio (usecode `.uc`, patches) |
| `data/` | Data files shipped with Exult (not the original game data) |
| `headers/` | Small shared headers (`pent_include.h`, `span.h`, ...) |
| `docs/` | Manuals and notes |
| `android/`, `ios/`, `macosx/`, `win32/`, `msvcstuff/`, `desktop/` | Platform packaging and project files |
| `configure.ac`, `Makefile.am`, `*.mk`, `Makefile.common`, `Makefile.mingw` | Build system |

## Build

Linux, from the repository root. This is a subset of what
`.github/workflows/ci-linux.yml` does (read it for the authoritative package
list and the full flag set):

```bash
autoreconf -v -i
./configure --with-debug=extreme --enable-exult-studio --enable-exult-studio-support \
    --enable-compiler --enable-zip-support --enable-shared --enable-midi-sfx \
    --enable-data --enable-mods CXX=g++ CC=gcc
make -j"$(nproc)"
```

- Dependencies include SDL3 and SDL3_image, zlib, libogg/libvorbis, libpng,
  FreeType, libxml2, bison, flex and autoconf-archive; Exult Studio also needs
  GTK. CI builds SDL 3.2.x from source. See [INSTALL](INSTALL) and
  `ci-linux.yml` for details.
- `--enable-compiler` builds `ucc` (`tools/compiler`), needed for usecode.
- Generated files (`configure`, `Makefile.in`, `uclex.cc`, `ucparse.cc`, ...)
  are in `.gitignore`; never commit them.
- Other platforms are built by the other `ci-*.yml` workflows; you usually
  cannot reproduce them locally, so keep changes portable (no new
  Linux-only headers or APIs in shared code).

## Tests

These entry points are provided by the CI/tests slice of the ACMM rollout
(`tests/`); until that PR is merged they may not exist yet. Check with
`ls tests` first.

```bash
tests/run-unit-tests.sh   # builds and runs the unit tests
tests/e2e/run.sh          # builds the command-line tools and runs end-to-end tests
```

CI (`.github/workflows/ci.yml`) runs them as the jobs `Unit tests (gcc)`,
`Unit tests (clang)` and `E2E (tools)`. `Coverage gate`, `agent-tooling` and
`policy-check` are separate workflows. The branch ruleset on `master`
(`docs/branch-protection.md`) requires these names, so do not rename them. The upstream `ci-*.yml` build
workflows are path-filtered (they skip `docs/**`, `*.md`, `README*`, ...), so a
docs-only PR only gets the repository's own checks.

Run the tests before every PR and add or update a test for each behaviour
change you can reach from the test harness. Say in the PR what you could not
test (for example anything needing the original game data, a GUI, audio or
another platform).

## Style

- Formatting is defined by `.clang-format` (clang-format 19, column limit
  132, tabs with width 4, `UseTab: ForContinuationAndIndentation`).
  `.github/workflows/format-check.yml` reports violations on PRs but is
  informational. Format only the lines you change; do not reformat whole
  files, since that drowns the review and blame (the repository keeps a
  `.git-blame-ignore-revs` for its past mass reformats).
- `.editorconfig` mirrors the whitespace rules for editors.
- Lint config is in `.clang-tidy`.
- New C++ source files carry the GPL header used by the existing files
  (copy the block at the top of e.g. `gumps/Gump.cc`; use the current year and
  "The Exult Team").
- C++17. No new third-party dependencies without owner approval.
- Usecode (`.uc`) is tab-indented like the C++.

## Never commit

- **Ultima VII game data or other copyrighted assets.** The rule is about
  provenance, not file extension: Exult's own `data/` and `content/` already
  track `.shp`, `.flx`, `.vga` and `.mid` files. Never add any file copied from
  an Ultima VII install (its `static/` and `gamedat/` contents, original
  archives, music, graphics) or a savegame (`*.sav`). Exult is legal only
  because it requires the user's own copy. Test fixtures must be synthetic or
  created by the test itself.
- Secrets, tokens, local paths or personal configuration (`exult.cfg`).
- Build output and generated files.

## Commits and pull requests

- Sign off every commit (`git commit -s`).
- Short imperative subject line, as in `git log`.
- Use the pull request template (`.github/pull_request_template.md`) and see
  [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/review-rubric.md](docs/review-rubric.md).
  List the exact checks you ran with their results, state what you did not
  verify, state the risk tier, and say the PR was prepared by an AI agent.
- One concern per PR. Disclose any change beyond what was asked.
- One `Closes #N` line per issue the PR resolves.
- Use `git -C <dir>` or absolute paths instead of `cd`, and `/var/tmp/<name>/`
  for scratch files.
- Cite code by function or symbol name in docs and PR text, not bare line
  numbers.

## Risk tiers

Defined in [docs/risk-tiers.md](docs/risk-tiers.md) and `risk-config.json`
(added by the agent-safety slice); the lists are not repeated here so they
cannot drift. Classify a path with
`node scripts/check-policies.mjs --classify <path>`. Note that `AGENTS.md`,
`CLAUDE.md`, `.claude/**`, `.cursor/rules/**` and `.github/**` are Tier 3.

Tier 3 changes need owner review; flag them in the PR. The agent boundaries are
in [docs/agent-boundaries.md](docs/agent-boundaries.md).

## Findings about the Bash guard hook: what is in scope

The Bash guard (`.claude/hooks/guard-bash.mjs`, which reads command lines
through `.claude/hooks/shell-reader.mjs`) catches **mistakes by an agent that
is following these rules**: writing to the wrong GitHub repository, pushing
where it should not, installing things on the host, or deleting game data. It
is not a sandbox against an agent that is trying to get around it. A shell can
spell a command in endless ways, and a reader in a hook cannot keep up with all
of them. Do not file, and do not fix unprompted, findings of this kind:

- **Disguised spellings.** A blocked command gets through only when its name
  or arguments are written in a form nobody types in ordinary work: quote
  marks inside a word (`g"i"t`), brace, wildcard or extended-glob names
  (`{git,}`, `g?t`, `g@(i)t`), backslash-newline splits, `$'...'` escapes,
  variables or command substitution that build the name, or the same tricks
  inside a command string handed to another shell or wrapper program.

These are still in scope. File them as usual:

- **The hook fails open.** It crashes, times out, or is missing a tool, and
  the command runs unchecked.
- **An ordinary spelling gets through.** The command is written the way an
  agent would type it doing normal work: the plain name, its full path
  (`/usr/bin/git`), a documented short option or alias (`git push -f`), or a
  common wrapper used for a real reason (`env`, `timeout`, `xargs`).
- **A regression.** A case the hook's tests already cover stops being
  refused.
- **The hook blocks normal work it should allow.**

This is a standing ruling, not a gap to report: an agent that has to disguise
a command to run it is already breaking the rules in this file.

## Where agent material lives

| Path | What it is |
|---|---|
| `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/exult.mdc` | Thin pointers to this file |
| `.github/prompts/` | Reusable prompt files; catalog in its README |
| `.claude/skills/` | Claude skills: `build-and-test`, `run-e2e`, `sync-from-upstream` |
| `.claude/memory/` | Verified corrections and lessons, one per file |
| `.claude/session-summary.md` | Session state and handoff |
| `docs/reflections/` | Dated write-ups of how work went |
| `.claude/settings.json`, `.claude/hooks/` | Claude permissions and guard hook (agent-safety slice) |

## Session continuity and cross-session knowledge

At the start of work read `.claude/session-summary.md`, skim
`.claude/memory/README.md` (index) and recent `git log`. Verify anything you
rely on from them against the live repository: branches, PR numbers and SHAs
drift. Put durable lessons in `.claude/memory/` and patterns in
`docs/reflections/`, not in chat. Agents do not merge, so the session summary
is rewritten in a dedicated handoff PR opened after the work has merged (or by
the owner), starting from the current `origin/master` copy. A session whose PR
is still waiting to merge puts its handoff notes in the PR body so concurrent
PRs do not conflict. `AGENTS.md` itself is Tier 3 and owner-reviewed. These files
are the shared handoff for every agent, not only Claude.
