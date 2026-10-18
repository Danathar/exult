---
description: Triage a crash or bug report into a reproducible, scoped issue on Danathar/exult
---

Triage ${input:report:issue number, text or stack trace}.

1. Extract: Exult version or commit, platform, which game (Black Gate, Serpent
   Isle, mod), whether a savegame is involved, exact steps, and the stack trace
   or message. List what is missing and ask for it.
2. Map the trace to code by symbol name and say which area it belongs to
   (engine core, `objs/`, `gumps/`, `usecode/`, `audio/`, `mapedit/`, `tools/`).
3. Say whether it can be reproduced without the original game data. Never ask
   for, attach or commit game files or savegames in the repository; savegames
   with personal data should not be posted publicly.
4. Check for duplicates among open `Danathar/exult` issues
   (`gh issue list --repo Danathar/exult --search "<terms>"`). Note if the bug
   appears to exist in upstream `exult/exult` too, but do not file or comment
   there; the owner decides whether to report upstream.
5. Produce a short issue text: summary, steps, expected vs actual, suspected
   area, risk tier of a likely fix, and whether a test is feasible. Create it
   only if asked, with `gh issue create --repo Danathar/exult`.
