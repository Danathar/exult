# Copilot instructions

Full rules: [AGENTS.md](../AGENTS.md). Critical points:

- Exult is a GPL C++17 autotools engine for Ultima VII. Format with
  `.clang-format` (tabs, width 4, column limit 132) and change only the lines
  you need to.
- This is the fork `Danathar/exult`. Every `gh` write command passes
  `--repo Danathar/exult`; PRs target `master`. Never open issues, PRs or
  comments on `exult/exult`.
- Never commit Ultima VII game data or other copyrighted assets.
- Run `tests/run-unit-tests.sh` and `tests/e2e/run.sh` before a PR and list
  what you ran. Sign off commits (`git commit -s`). Do not merge.
- New source files carry the GPL header used by the existing files.
