---
description: Review a pull request on Danathar/exult against docs/review-rubric.md
---

Review PR ${input:pr:PR number} on `Danathar/exult`.

1. Fetch it with `gh pr view ${input:pr} --repo Danathar/exult` and
   `gh pr diff ${input:pr} --repo Danathar/exult`.
2. Apply every criterion in `docs/review-rubric.md` and the rules in
   `AGENTS.md`. Check in particular: no Ultima VII game data or other
   copyrighted assets; GPL header on new source files; commits signed off; the
   risk tier stated and correct per `docs/risk-tiers.md`; savegame and
   file-format code (`files/`, `gamedat.cc`, `objs/` serialization) handled
   carefully; tests added or the gap explained; portable across the platforms
   the `ci-*` workflows build.
3. Check the PR's claims against its diff and the check results
   (`gh pr checks ${input:pr} --repo Danathar/exult`). Note when upstream
   `ci-*` workflows were skipped by their path filters.
4. Report findings by severity with file and symbol references. Say what you
   did not verify.
5. Post a review only if asked; any `gh` write command passes
   `--repo Danathar/exult`. Do not approve or merge on the owner's behalf.
