---
description: Port one upstream exult/exult change into the Danathar/exult fork as a normal PR
---

Port upstream change ${input:change:upstream commit SHA or PR URL} into the fork.

Syncing the whole fork with upstream is the owner's job (see
`.claude/skills/sync-from-upstream/SKILL.md`); this prompt is for a single
change the owner asked for.

1. Read the upstream change (read-only, for example the commit or PR page on
   GitHub). Do not add an upstream remote, and do not comment on or open
   anything on `exult/exult`.
2. Branch from current `master` and apply the same change by hand or with
   `git apply` from a patch saved under `/var/tmp/`. Keep authorship credit
   in the commit message (original author and upstream commit SHA) and the
   original file license headers.
3. Check that it still applies to this fork's code, does not conflict with
   fork-only files, and does not pull in game data.
4. Run `tests/run-unit-tests.sh` (and `tests/e2e/run.sh` where relevant).
5. Sign off the commit (`git commit -s`) and open the PR with
   `gh pr create --repo Danathar/exult --base master --head <branch>`, citing
   the upstream commit SHA (or the URL inside a code span, so GitHub does not
   cross-reference upstream PRs), and stating what was not
   verified.
