# Agent boundaries

What an AI agent may change on its own in this repository, and what needs the
owner (Danathar). It maps the tiers in [docs/risk-tiers.md](risk-tiers.md) to
the owners in [`.github/CODEOWNERS`](../.github/CODEOWNERS), and complements
`AGENTS.md` and the [AI security policy](security/SECURITY-AI.md).

This repository is a fork of `exult/exult`. Agents open pull requests and
issues against `Danathar/exult` only (`--repo Danathar/exult` on every `gh`
write command): `gh` defaults a fork to its upstream parent, so a command
without the flag lands on the upstream project.

## By tier

| Tier | Agent may | Agent may not |
| ---- | --------- | ------------- |
| 3 critical | Propose a change in a pull request when the owner asked for it, and run the required commands. | Merge it, change it as part of unrelated work, or edit files that bound agents (`AGENTS.md`, `policies/`, `risk-config.json`, `.github/`, `.claude/settings.json`, `.claude/hooks/`) at all unless the owner told it to. |
| 2 standard | Open a pull request with the required commands run and reported; the required CI jobs are the gate. | Merge it, skip or loosen a failing check. |
| 1 low | Open a pull request; the required CI jobs are the gate. | Use a docs-only change to hide a change to code, a build or a command users run. |

Tier is by what the change can break, and the highest tier any touched path
matches applies, raised by the rules in "Raise the tier" in
[risk-tiers.md](risk-tiers.md). `node scripts/check-policies.mjs --classify
<path>...` prints the tier of a path but cannot see inside a file.

## Who owns what

`.github/CODEOWNERS` lists the Tier 3 paths with `@Danathar`, and nothing
else: there is no catch-all `*`. `node scripts/check-policies.mjs` fails when a
path of a tier that needs owner review is missing there, when a `*` entry is
added, or when a later entry overrides the owner for such a path (GitHub
applies the last matching line). CODEOWNERS only *requests* the owner's review:
the `master` ruleset ([branch-protection.md](branch-protection.md)) requires a
pull request and six status checks but not code owner review, so this
repository does not claim that a Tier 3 pull request cannot merge without the
owner.

## Always off limits

These need the owner's explicit instruction in the conversation, whatever the
tier. The Claude Code Bash guard (`.claude/hooks/guard-bash.mjs`) refuses most
of them before they run; other agents are bound by this list.

- `sudo`, in any form.
- `make install`, `cmake --install` and other installs into the system, and
  system package managers (`dnf`, `apt`, `rpm-ostree`, `brew`, ...). Build in
  the tree and run from there; there is no `DESTDIR` exception, because the
  install hooks also touch the host.
- Deleting or moving Ultima VII game data, savegames or the user's Exult
  configuration (`gamedat/`, the repository-root `static/`, `*.sav`, `~/.exult`,
  `~/.config/exult`, installed game directories), and `git clean -x`, which
  deletes the ignored `gamedat/` directory.
- Committing game data or any copyrighted asset from the original games
  (`policies/game-data.json` checks the paths).
- Reading, printing or committing credentials, tokens, `.env` files, or
  anything under `~/.ssh` and `~/.config/gh`.
- Adding a remote, in particular an upstream remote; the only remote is
  `origin` (Danathar/exult). Pushing anywhere else, pushing to `master`, and
  force-pushing.
- Merging, approving, or closing pull requests the agent did not open.
- Repository settings, rulesets, labels, secrets, branch protection.
- Posting anywhere other than `Danathar/exult`: no issues, pull requests or
  comments on `exult/exult`.
- Editing `COPYING`.

## Files that bound agents

Changing these relaxes the agent boundary itself, so a green CI run is not
enough and the owner reads the diff (all Tier 3):

- `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.claude/skills/`, and
  `.github/` (including `copilot-instructions.md`, prompts and workflows)
- `.claude/settings.json` and `.claude/hooks/` (the permission table and the
  Bash guard)
- `policies/`, `scripts/check-policies.mjs`, `risk-config.json`
- `docs/security/`, `docs/risk-tiers.md`, this file

`policies/repo-target.json` lists the direction files that must carry
`--repo Danathar/exult`. Add a new one there when you add a new kind of agent
instruction file.
