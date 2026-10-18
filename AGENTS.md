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
- `gh` resolves a fork's default repository to its parent unless told
  otherwise, so **every `gh` write command passes `--repo Danathar/exult`**,
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

Linux, from the repository root. This is what `.github/workflows/ci-linux.yml`
does (read it for the authoritative package list and flags):

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

CI (`.github/workflows/ci.yml`) runs them as the required checks
`Unit tests (gcc)`, `Unit tests (clang)` and `E2E (tools)`, plus
`Coverage gate`, `agent-tooling` and `policy-check`. Do not rename those jobs:
the branch ruleset refers to them by name. The upstream `ci-*.yml` build
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

- **Ultima VII game data or other copyrighted assets**: the original games'
  `static/` and `gamedat/` directories, `*.flx`, `*.vga`, `*.shp`, `*.mid`
  and other files taken from the game, and savegames (`*.sav`). Exult is
  legal only because it requires the user's own copy. Test fixtures must be
  synthetic or created by the test itself. (Mod content under `content/` is
  authored for Exult and is already tracked.)
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
(added by the agent-safety slice):

- **Tier 1:** docs, comments, tests only.
- **Tier 2:** ordinary engine and tool code.
- **Tier 3:** build system (`configure.ac`, `Makefile.am`, `*.mk`), `.github/**`,
  `.claude/settings.json`, `.claude/hooks/**`, `policies/**`,
  `risk-config.json`, `CODEOWNERS`, `AGENTS.md`, `COPYING`, and savegame or
  file-format code (`files/`, `gamedat.cc`, serialization in `objs/`).

Tier 3 changes need owner review; flag them in the PR. The agent boundaries are
in [docs/agent-boundaries.md](docs/agent-boundaries.md).

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
`docs/reflections/`, not in chat. Only the session that lands work on `master`
rewrites the session summary; a session that opens a PR to be merged later puts
its handoff notes in the PR body so concurrent PRs do not conflict. These files
are the shared handoff for every agent, not only Claude.
