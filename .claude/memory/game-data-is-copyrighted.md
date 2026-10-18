# Ultima VII game data is copyrighted and never committed

**Date:** 2026-10-18
**Wrong:** adding original game files (`*.flx`, `*.vga`, `*.shp`, `static/` or
`gamedat/` from a real install, savegames) as test fixtures or samples.
**Right:** Exult requires the player to own the game. Tests generate their own
synthetic inputs. `content/` holds mod content written for Exult and is already
tracked; that does not make original data acceptable.
**Why it matters:** redistributing the original files is a copyright problem for
the owner and the public fork.
**Evidence:** README.md ("You need to own ... Ultima VII ... in order to use
Exult"); `data/` and `content/` are the Exult project's own files [INFERENCE from the layout; not audited file by file].
