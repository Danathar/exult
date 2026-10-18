# Contributing

This is `Danathar/exult`, a personal fork of the upstream Exult project
(<https://github.com/exult/exult>), an Ultima VII game engine written in C++17
(GPL-2.0-or-later, see [COPYING](COPYING)). The fork exists so the owner can work
on the engine and its tooling, including with AI agents under guardrails (see
[docs/multi-agent.md](docs/multi-agent.md)), without touching upstream.

## Where things go

- **Pull requests and issues for this fork go to `Danathar/exult` only**, base
  branch `master`. Do not open issues or PRs on `exult/exult` from this work. When using
  the GitHub CLI, a fork defaults to its parent, so always pass the repository:
  `gh pr create --repo Danathar/exult --base master --head <branch>`.
- Bugs in released Exult, game behaviour and data-file questions belong upstream
  ([bugs](https://github.com/exult/exult/issues), [questions](https://github.com/exult/exult/discussions), IRC `#exult` on Libera.Chat). Upstream's FAQ asks for the latest snapshot, the version and platform, and a relevant savegame.
  Check there first; the issue templates here say the same.
- **Upstream changes arrive through the owner**, who syncs `master` from upstream.
  Contributors and agents do not merge upstream into this fork or add an
  upstream remote. A fix that is also good for upstream is for the owner to send
  there by hand.

## Ground rules

- **Never commit Ultima VII game data or copyrighted assets**: the original
  `static/`, `gamedat/`, `*.flx` files and anything from the original games.
  Exult needs the player's own copy of the games; tests and CI must not.
- **Savegame and data-file compatibility is a safety property.** A change that
  alters how a savegame (`gamedat`, `objs/` serialization, `files/`) or an
  Exult data file is read or written needs owner sign-off and a compatibility
  note in the PR.
- Keep usecode behaviour for Black Gate and Serpent Isle (and shipped mods)
  unchanged unless the PR is about exactly that.
- Do not edit the upstream-owned workflows (`ci-*.yml`, `codeql.yml`,
  `coverity-scan.yml`, `snapshots*.yml`, `notify.yml`, `released.yml`,
  `format-check.yml`) in fork PRs.

## Build

From a clone, on Linux (the recipe the upstream `ci-linux.yml` uses; see that
file for the exact package list):

```bash
# Debian/Ubuntu build dependencies (abridged; ci-linux.yml is authoritative)
sudo apt-get install build-essential autoconf-archive bison flex cmake \
  zlib1g-dev libogg-dev libvorbis-dev libasound2-dev libfluidsynth-dev \
  libpng-dev libfreetype6-dev libxml2-dev
# SDL3 and SDL3_image 3.2.x are also required (build from source if your
# distribution does not package them).
autoreconf -v -i && ./configure && make -j"$(nproc)"
```

Other platforms (Windows MinGW/MSVC, macOS, Android, iOS, FreeBSD, OmniOS) are
built by the upstream `ci-*.yml` workflows; see `README` and `README.windows`,
`README.macOS`.

## Tests

Two entry points (provided by the CI/tests PR for this fork; they exist once
that PR is merged):

```bash
tests/run-unit-tests.sh   # builds and runs the unit tests
tests/e2e/run.sh          # builds the tools (ucc, expack, ipack...) and runs end-to-end checks
```

If you touched `scripts/`, also run `node --test 'scripts/tests/*.test.mjs'`
(Node 24 or newer). Add or update a test for each behaviour change. CI is described in
[docs/quality.md](docs/quality.md).

## Style

Follow `.clang-format` and `.clang-tidy` in the repository root (tabs, C++17).
The upstream `format-check.yml` runs clang-format 19 on every PR and is
informational, not blocking. Format only the lines you change; do not reformat
whole files in a functional PR.

## Commits and PRs

- One logical change per PR. The title says what changed; the body has one
  `Closes #N` line per issue it resolves, the exact commands you ran with the
  results, and what you could not verify (platforms, games, mods).
- Sign off every commit (`git commit -s`, a `Signed-off-by:` trailer).
- If an AI tool helped, say so in the PR (the template has a checkbox).
- Do not push to someone else's branch; comment instead.
- A PR is merged by the owner or by Hive's serialized lane after the required
  checks pass; authors do not merge their own PRs.

## Risk tiers

How closely a change is reviewed depends on what it touches
([docs/risk-tiers.md](docs/risk-tiers.md) and `risk-config.json`, added by the
agent-safety PR):

| tier | paths |
|---|---|
| 1 | docs, comments, tests only |
| 2 | ordinary engine and tool code |
| 3 | build system (`configure.ac`, `Makefile.am`, `*.mk`), `.github/**`, `.claude/settings.json`, `.claude/hooks/**`, `policies/**`, `risk-config.json`, `CODEOWNERS`, `AGENTS.md`, `COPYING`, savegame and file-format code (`files/`, `gamedat.cc`, `objs/` serialization) |

Tier 3 changes need the owner's review. Review criteria:
[docs/review-rubric.md](docs/review-rubric.md).

## Reporting bugs and requesting features

Use the issue templates. For a bug in this fork, give the game (BG, SI, mod),
the version or commit, the platform and compiler, reproduction steps, and say
whether it needs a particular savegame. Never attach game files. Report
security problems privately through the Security tab.
