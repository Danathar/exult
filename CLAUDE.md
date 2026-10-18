# CLAUDE.md

@AGENTS.md

## Claude Code notes

`AGENTS.md` is the source of truth; this file only restates the critical rules.

- Fork rule: work only on `Danathar/exult`. Every `gh` write command passes
  `--repo Danathar/exult` (PRs: `--base master`). Never touch `exult/exult`.
- Never commit Ultima VII game data or other copyrighted assets.
- Sign off commits (`git commit -s`); run the tests (`tests/run-unit-tests.sh`,
  `tests/e2e/run.sh`) before a PR; do not merge.
- Use `git -C <dir>` or absolute paths instead of `cd`; scratch goes in
  `/var/tmp/<name>/`.
- Skills are in `.claude/skills/`: `build-and-test`, `run-e2e`,
  `sync-from-upstream` (owner only).
- At the start of a session read `.claude/session-summary.md` and
  `.claude/memory/README.md`; the end-of-session rule is in the summary.
