# fix/name-entry-double-space-330

- **Files:** `gamemgr/bggame.cc`, `gamemgr/sigame.cc`
- **Reason:** New-game name entry appended a space for both the Space KEY_DOWN and its TEXT_INPUT, so each typed space went in twice; skip the KEY_DOWN append while text input is active
- **Upstream status:** not reported
