# Change risk tiers

How to classify a change to this repository, and what each tier requires before
it merges. This is also the change-classification rule: reviewers and agents use
it to decide how much scrutiny a pull request needs. [Agent boundaries](agent-boundaries.md)
maps the tiers to what an agent may change without the owner.

The tier is set by **what the change can break**, not by diff size. Exult is a
C++17 game engine plus tools (Exult Studio, `ucc`, `expack`, `ipack`, ...)
built with autotools and several other build systems, and it reads and writes
the original Ultima VII's data files and savegames. A one-line change to how a
savegame is written is Tier 3, and a 300-line change to a README is Tier 1.

This file is the source. [`risk-config.json`](../risk-config.json) restates the
table below as data, and `node scripts/check-policies.mjs` fails when the two
disagree. To change a tier, edit both in the same pull request, and keep
[`.github/CODEOWNERS`](../.github/CODEOWNERS) in step: the checker also fails
when a path whose review is `owner` has no CODEOWNERS entry.

## Tier table

Tier 3 is the most dangerous. `**` matches any depth (`**/` also matches the
repository root), `*` matches within one directory level. A path no row lists
is Tier 2.

| Tier | Name | Covers | Required commands | Review |
| ---- | ---- | ------ | ----------------- | ------ |
| 1 | low | `docs/**`, `**/*.md`, `**/*.txt`, `tests/**` | `node scripts/check-policies.mjs` | `ci` |
| 2 | standard | `**/*.cc`, `**/*.cpp`, `**/*.h`, `**/*.hpp`, `**/*.mm`, `**/*.uc`, `**/*.sh`, `scripts/**` | `tests/run-unit-tests.sh`, `tests/e2e/run.sh`, `node scripts/check-policies.mjs`, `node --test 'scripts/tests/*.test.mjs'` | `ci` |
| 3 | critical | `configure.ac`, `**/Makefile.am`, `**/*.mk`, `.github/**`, `.claude/settings.json`, `.claude/hooks/**`, `.claude/skills/**`, `.cursor/rules/**`, `policies/**`, `scripts/check-policies.mjs`, `risk-config.json`, `AGENTS.md`, `CLAUDE.md`, `COPYING`, `docs/risk-tiers.md`, `docs/agent-boundaries.md`, `docs/security/**`, `files/**`, `gamedat.cc`, `objs/animate.*`, `objs/barge.*`, `objs/chunks.*`, `objs/contain.*`, `objs/egg.*`, `objs/iregobjs.*`, `objs/objs.*`, `objs/spellbook.*`, `objs/virstone.*` | `tests/run-unit-tests.sh`, `tests/e2e/run.sh`, `node scripts/check-policies.mjs`, `node --test 'scripts/tests/*.test.mjs'`, `node --test '.claude/hooks/tests/*.test.mjs'`, `actionlint` | `owner` |

Review values: `owner` means the repository owner (Danathar) reads the diff and
merges it, and a green CI run alone is not enough. `ci` means the required CI
checks must pass and an agent may open the pull request; Hive merges it under
its `hive-serialized` strategy once the checks are green.

The required commands name these entry points: `tests/run-unit-tests.sh` and
`tests/e2e/run.sh` (the test suites), and the `CI`, `Coverage gate`,
`policy-check` and `agent-tooling` workflows. `actionlint` is the workflow
linter and is run only when a `.github/workflows/` file changed. The `master`
ruleset requires those six check jobs for every merge; see
[branch-protection.md](branch-protection.md).

## Raise the tier

A path glob cannot see inside a file, so some changes are riskier than the
table says. **Raise a change to Tier 3** when it:

- changes how savegames, `gamedat`, Flex/IFF archives or the `U7file`/`Table`
  readers and writers encode or decode data, even in a file the table lists as
  Tier 2 (for example a `*.cc` file under `shapes/`, `gumps/` or `usecode/` that
  writes `ireg`/`ifix` data): an existing user save must still load and a
  save written by the change must still load in the previous release;
- changes compiler or linker flags, warning levels, dependency versions or the
  list of source files in a way that alters the build for other platforms
  (Windows, macOS, Android, iOS, FreeBSD, OmniOS) than the one you tested;
- adds, upgrades or removes a bundled third-party library, which also changes
  the licence picture (Exult is GPL-2.0-or-later);
- changes `usecode` bytecode semantics or the `ucc` compiler's output for
  existing scripts, because the original game's scripts depend on it;
- weakens, skips or deletes a test, a lint rule or a coverage threshold;
- makes a command in a doc or script that users run as root, or that installs
  into the system, behave differently.

A pull request that spans tiers meets the requirements of its highest tier.

## How to apply it

1. List every path the change touches.
2. Take the **highest** (most dangerous, highest-numbered) tier any path
   matches. A path that matches several rows, such as `docs/security/SECURITY-AI.md`
   (Tier 3) and `docs/**` (Tier 1), takes the higher number.
3. A path no row lists is Tier 2.
4. Raise the tier, never lower it, using the rules above.
5. Run every command in the tier's Required column that exists, and say in the
   pull request which ones ran and what they printed.

`node scripts/check-policies.mjs --classify <path> ...` prints the tier the
path table assigns to each path. It does not apply the rules in "Raise the
tier".

## Why these paths

- **Tier 1 (`docs/**`, `**/*.md`, `**/*.txt`, `tests/**`).** Documentation and
  tests do not ship in the binaries. A test change can hide a regression, which
  is why weakening one is a Tier 3 reason above.
- **Tier 2 (C++ and usecode sources, shell, `scripts/**`).** Ordinary engine
  and tool work. The unit and end-to-end tests and the CI build matrix are the
  gate.
- **Build system (`configure.ac`, `Makefile.am`, `*.mk`).** One edit changes
  every platform's build and every packaging path.
- **`.github/**`.** What runs with repository tokens, what blocks a merge, and
  who must approve. A workflow that gets write scope or an interpolated issue
  title is a way into the repository.
- **`.claude/settings.json`, `.claude/hooks/**`, `.claude/skills/**`,
  `.cursor/rules/**`, `AGENTS.md`, `CLAUDE.md`.** The agent permission table,
  the Bash guard and the instructions agents follow. A loosened one loosens the
  agent. They are changed by the owner, never by the agent they constrain.
- **`policies/**`, `scripts/check-policies.mjs`, `risk-config.json`.** The rules
  and the checker that enforce them.
- **`COPYING`.** The licence text; changing it changes what users may do with
  the code.
- **`docs/risk-tiers.md`, `docs/agent-boundaries.md`, `docs/security/**`.** The
  written boundary agents are judged by. Ordinary `docs/**` is Tier 1, but these
  are Tier 3 so an agent cannot change them under the `ci` gate. Edit them
  together with the policy files they describe.
- **Savegame and file-format code (`files/**`, `gamedat.cc`, and in `objs/` the files that define `write_ireg`/`write_ifix`).** A
  bug here corrupts or loses a player's saved game. The `objs/` list is the
  files a grep for those functions finds (`animate`, `barge`, `chunks`,
  `contain`, `egg`, `iregobjs`, `objs`, `spellbook`, `virstone`); the other
  `objs/` files are Tier 2, and serialization added elsewhere is covered by
  "Raise the tier".

## Pull request notes by tier

- Tier 2 and Tier 3: state in the PR body which required commands ran and what
  they printed, and what could not be run.
- Tier 3 changes to a workflow: say what was verified and what could not be (a
  cron schedule cannot be proven before it fires).
- Tier 3 changes to savegame or file-format code: say how an existing save was
  or was not exercised. Never use the original game's copyrighted data in the
  repository or in a pull request to check; use your own copy locally and say so.

See also [`.github/CODEOWNERS`](../.github/CODEOWNERS) and
[AI security policy](security/SECURITY-AI.md).
