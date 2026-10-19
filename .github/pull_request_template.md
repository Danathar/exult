## Summary

<!-- What changed and why. Closes #N (an issue in Danathar/exult) -->

## Risk tier

<!-- Highest tier touched; see docs/risk-tiers.md. -->

- [ ] Tier 1: only `docs/**`, `*.md`, `*.txt`, `tests/**`
- [ ] Tier 2: engine and tool source (`*.cc`, `*.h`, `*.uc`, `*.sh`, `scripts/**`)
- [ ] Tier 3: `configure.ac`, `Makefile.am`, `*.mk`, `.github/**`, agent config and hooks, `policies/**`, `risk-config.json`, `AGENTS.md`, `COPYING`, savegame / file-format code (`files/**`, `gamedat.cc`, parts of `objs/`), or any change raised by docs/risk-tiers.md
<!-- Classify: node scripts/check-policies.mjs --classify <path>... -->

## Checks run

<!-- Paste the exact commands and what you observed. -->

- [ ] `tests/run-unit-tests.sh`
- [ ] `tests/e2e/run.sh` (if a tool such as `ucc`, `expack` or `ipack` changed)
- [ ] `node --test 'scripts/tests/*.test.mjs'` (if `scripts/` changed)
- [ ] Builds with `autoreconf -v -i && ./configure && make` on Linux (say which compiler)
- [ ] Added or updated a test for each behaviour change
- [ ] Docs or `ChangeLog` updated if user-visible behaviour changed

## Engine compatibility

- [ ] Savegame and data-file formats are unchanged, or the change is described below with a compatibility note
- [ ] No Ultima VII game data or other copyrighted asset is added (`static/`, `gamedat/`, original `*.flx`)
- [ ] Usecode behaviour for the original games (BG, SI) and shipped mods is unchanged, or described below
- [ ] No new per-frame cost in the render or game loop, or measured and described below

## Fork rule

- [ ] This PR targets `Danathar/exult` `master`. It is not an upstream `exult/exult` PR.
- [ ] Changes an upstream-owned file: row added to `docs/fork-delta.md`

## Not verified

<!-- Platforms, games or mods you could not test (for example Windows, macOS, Serpent Isle). -->

## AI assistance

- [ ] Prepared with AI assistance (name the tool), or
- [ ] No AI assistance was used
