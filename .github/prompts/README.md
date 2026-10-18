# Prompt catalog

Reusable prompt files for Copilot Chat / VS Code (`.prompt.md`); the content
works as a plain prompt in any other tool. All of them assume the rules in
[AGENTS.md](../../AGENTS.md): work only on `Danathar/exult`, pass
`--repo Danathar/exult` to every `gh` write command, never commit Ultima VII
game data, do not merge.

| Prompt | Use it when |
|---|---|
| [fix-engine-bug.prompt.md](fix-engine-bug.prompt.md) | Fixing a bug in the engine or tools, with a regression test where the harness allows |
| [review-pr.prompt.md](review-pr.prompt.md) | Reviewing a PR against `docs/review-rubric.md` |
| [triage-crash-report.prompt.md](triage-crash-report.prompt.md) | Turning a crash or bug report into a reproducible, scoped issue |
| [port-upstream-commit.prompt.md](port-upstream-commit.prompt.md) | Porting one specific upstream `exult/exult` change into the fork |

Add a new prompt as `<verb-noun>.prompt.md` with a `description` in the
frontmatter and a row in the table above.
