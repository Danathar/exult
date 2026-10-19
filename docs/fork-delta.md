# Fork delta: engine changes this fork carries

`Danathar/exult` is a fork of `exult/exult`. Most of what the fork adds lives in
files upstream does not have: `tests/`, `scripts/`, `docs/`, `.claude/`,
`.cursor/`, `.github/`, `policies/`, and root files such as `AGENTS.md`. This
page lists the other kind of change: edits to **upstream-owned files**
(engine, tools, build files), merged into `master` and carried on top of
upstream.

It exists for two jobs:

- **Syncing from upstream.** A conflict inside an engine file is resolved
  against its row here. See
  [`sync-from-upstream`](../.claude/skills/sync-from-upstream/SKILL.md).
- **Sending fixes upstream.** The rows with status `not reported` are the
  candidates for the owner to send to `exult/exult` by hand. See
  [CONTRIBUTING](../CONTRIBUTING.md).

## Keeping it current

- **Add a row** in the same pull request that changes an upstream-owned file
  (anything outside the fork-only paths above). Each PR adds its own row, so
  the list stays complete without a separate backfill. A PR that touches only
  fork-only paths adds nothing.
- **Upstream status** is one of `not reported`, `reported <link>`, or
  `fixed upstream in <commit>`.
- **Drop a row** at sync time once upstream fixed the same bug and the sync
  took upstream's version (status `fixed upstream in <commit>`).
- Keep the reason to one line; the PR holds the detail.

## Changes carried

| PR | Files | Reason | Upstream status |
| -- | ----- | ------ | --------------- |
| [#190](https://github.com/Danathar/exult/pull/190) | `conf/Configuration.cc`, `conf/XMLEntity.cc`, `conf/XMLEntity.h`, `files/utils.cc` | Reject malformed config files with an error instead of asserting; make `U7copy` accept an empty source file | not reported |
| [#227](https://github.com/Danathar/exult/pull/227) | `usecode/ucinternal.cc` | Drop surplus indirect-call arguments instead of writing past the callee's locals | not reported |
| [#229](https://github.com/Danathar/exult/pull/229) | `audio/midi_drivers/timidity/timidity_resample.cpp`, `audio/midi_drivers/timidity/timidity_instrum.cpp` | Pad pre-resampled TiMidity drum buffers with two zeroed samples so the resamplers do not read past the end | not reported |
