# Fork delta: engine changes this fork carries

`Danathar/exult` is a fork of `exult/exult`. Most of what the fork adds lives in
files upstream does not have: `tests/`, `scripts/`, `.claude/`, `.cursor/`,
`policies/`, root files such as `AGENTS.md`, and the files the fork added under
`docs/` and `.github/`. This page lists the other kind of change: edits to
**upstream-owned files** (engine, tools, build files), merged into `master` and
carried on top of upstream. A file is upstream-owned when `exult/exult` has it,
wherever it lives: `docs/` and `.github/` hold upstream files too, such as
`docs/Makefile.am`.

It exists for two jobs:

- **Syncing from upstream.** A conflict inside an engine file is resolved
  against its row here. See
  [`sync-from-upstream`](../.claude/skills/sync-from-upstream/SKILL.md).
- **Sending fixes upstream.** The rows with status `not reported` are the
  candidates for the owner to send to `exult/exult` by hand. See
  [CONTRIBUTING](../CONTRIBUTING.md).

## Keeping it current

- **Add a row** in the same pull request that changes an upstream-owned file.
  A PR that touches only files upstream does not have adds nothing. Rows for
  the PRs that merged before they had to add one (#185 to #218) were
  backfilled from `git log`.
- **Upstream status** is one of `not reported`, `reported <link>`, or
  `fixed upstream in <commit>`.
- **Drop a row** at sync time once upstream fixed the same bug and the sync
  took upstream's version (status `fixed upstream in <commit>`).
- Keep the reason to one line; the PR holds the detail.

## Changes carried

| PR | Files | Reason | Upstream status |
| -- | ----- | ------ | --------------- |
| [#185](https://github.com/Danathar/exult/pull/185) | `configure.ac`, `m4/gb_enable_lto.m4` | Make `configure` honour `--disable-static-libraries` and `--disable-hqNx`, and handle a compiler that rejects `-flto` | not reported |
| [#186](https://github.com/Danathar/exult/pull/186) | `Makefile.am`, `Makefile.common`, `data/Makefile.am`, `docs/Makefile.am`, `mapedit/Makefile.am`, `tools/aseprite_plugin/Makefile.am`, `tools/gimp_plugin/Makefile.am` | Fix `make dist` file lists, plugin source lists and the shortcut bar's build dependencies | not reported |
| [#188](https://github.com/Danathar/exult/pull/188) | `tools/expack.cc`, `tools/ipack.cc`, `tools/textpack.cc` | Stop crashes and hangs in `ipack`, `expack` and `textpack` on bad input | not reported |
| [#189](https://github.com/Danathar/exult/pull/189) | `tools/compiler/ucexpr.cc`, `tools/compiler/ucexpr.h`, `tools/compiler/ucparse.yy`, `tools/compiler/ucsym.cc` | Make `ucc` fail with an error on bad input instead of crashing or exiting 0 (exit status and redeclaration crashes now take upstream's fix, `d117919d1`; still carried: wrapping fold helpers, `&function` at file scope, `class<?>` for a failed class lookup) | not reported |
| [#190](https://github.com/Danathar/exult/pull/190) | `conf/Configuration.cc`, `conf/XMLEntity.cc`, `conf/XMLEntity.h`, `files/utils.cc` | Reject malformed config files with an error instead of asserting; make `U7copy` accept an empty source file | not reported |
| [#191](https://github.com/Danathar/exult/pull/191) | `usecode/ucfunction.cc`, `usecode/ucinternal.cc`, `usecode/ucinternal.h`, `usecode/useval.h` | Stop hangs and out-of-bounds access in the usecode VM | not reported |
| [#194](https://github.com/Danathar/exult/pull/194) | `files/msgfile.cc` | Fix text message file parsing of whitespace-only lines, a bare `%%section` and huge indexes | not reported |
| [#195](https://github.com/Danathar/exult/pull/195) | `tools/ucxt/include/ucdata.h`, `tools/ucxt/src/ops.cc`, `tools/ucxt/src/ucxt.cc` | Fix `ucxt -o` output, a crash on missing usecode and `-nc` data loading | not reported |
| [#196](https://github.com/Danathar/exult/pull/196) | `tools/mklink.cc`, `tools/wuc.cc` | Fix a `wuc` hang at end of file and a label overflow; bound `mklink`'s function table | not reported |
| [#197](https://github.com/Danathar/exult/pull/197) | `tools/rip.cc`, `tools/shp2pcx.cc`, `tools/splitshp.cc`, `tools/u7voice2syx.cc` | Fix `rip` glue, `u7voice2syx` checksums and `splitshp`/`shp2pcx` input handling | not reported |
| [#198](https://github.com/Danathar/exult/pull/198) | `mapedit/shapelst.cc`, `shapes/pngio.cc` | Fix PNG transparent palette remapping, hostile image sizes and interlacing; Studio compares the full palette | not reported |
| [#199](https://github.com/Danathar/exult/pull/199) | `shapes/shapevga.cc`, `shapes/vgafile.cc` | Bound shape RLE runs and validate shape and shape-info input sizes | not reported |
| [#200](https://github.com/Danathar/exult/pull/200) | `audio/AudioChannel.cc`, `audio/AudioChannel.h`, `audio/RawAudioSample.cc`, `audio/VocAudioSample.cc`, `audio/WavAudioSample.cc` | Bound VOC and WAV parsing and fix audio resampler setup | not reported |
| [#201](https://github.com/Danathar/exult/pull/201) | `files/utils.cc`, `files/utils.h`, `gamedat.cc`, `gamemgr/modmgr.cc` | Validate savegame entry names and sizes | not reported |
| [#202](https://github.com/Danathar/exult/pull/202) | `audio/midi_drivers/CoreAudioMidiDriver.cpp`, `audio/midi_drivers/CoreMidiDriver.cpp`, `audio/midi_drivers/WindowsMidiDriver.cpp` | Bound MIDI sysex buffers and report CoreAudio open failures | not reported |
| [#203](https://github.com/Danathar/exult/pull/203) | `audio/midi_drivers/timidity/timidity_instrum.cpp`, `audio/midi_drivers/timidity/timidity_resample.cpp` | Validate TiMidity patch headers and stop resampler over-reads | not reported |
| [#204](https://github.com/Danathar/exult/pull/204) | `imagewin/scale_2xSaI.cc`, `imagewin/scale_bilinear.h` | Fix source bounds in the bilinear and 2xSaI scalers | not reported |
| [#205](https://github.com/Danathar/exult/pull/205) | `actorio.cc`, `actors.cc`, `combat.cc`, `schedule.cc` | Fix actor stat save/load, the drop position on death and schedule loops | not reported |
| [#206](https://github.com/Danathar/exult/pull/206) | `audio/midi_drivers/FMOplMidiDriver.cpp`, `audio/midi_drivers/LowLevelMidiDriver.cpp`, `audio/midi_drivers/XMidiEvent.h`, `audio/midi_drivers/XMidiSequence.h`, `audio/midi_drivers/fmopl.cpp` | Fix FM OPL pan, program change and note index bugs | not reported |
| [#207](https://github.com/Danathar/exult/pull/207) | `combat.cc`, `dir.cc`, `effects.cc`, `gamemgr/modmgr.cc`, `keyactions.cc` | Fix sprite Y offset, combat music, map wrap delta and several bounds checks | not reported |
| [#208](https://github.com/Danathar/exult/pull/208) | `audio/midi_drivers/XMidiEventList.cpp`, `audio/midi_drivers/XMidiFile.cpp`, `audio/midi_drivers/XMidiSequence.cpp` | Validate MIDI/XMIDI input and fix XMIDI FOR loop handling | not reported |
| [#209](https://github.com/Danathar/exult/pull/209) | `actors.cc`, `mapedit/npcedit.cc`, `mapedit/shapefile.cc`, `server/objserial.cc`, `server/objserial.h`, `server/server.cc` | Bound Exult Studio protocol messages and keep NPC schedule entries | not reported |
| [#210](https://github.com/Danathar/exult/pull/210) | `audio/Audio.cc`, `audio/midi_drivers/XMidiFile.cpp` | Do not crash on a failed timbre extraction or unrecognised sound effect data | not reported |
| [#211](https://github.com/Danathar/exult/pull/211) | `audio/midi_drivers/MidiDriver.cpp`, `gumps/ConfigSetting_widget.cc`, `gumps/DropDown_widget.cc`, `gumps/GameEngineOptions_gump.cc`, `gumps/GameEngineOptions_gump.h`, `gumps/StringList_widget.cc` | Fix option widget bounds and the padded Fake MT32 setting value | not reported |
| [#212](https://github.com/Danathar/exult/pull/212) | `mapedit/shapeedit.cc`, `shapes/shapeinf.h` | Fix Exult Studio shape editor save bugs and a weapon offset over-read | not reported |
| [#213](https://github.com/Danathar/exult/pull/213) | `gumps/Gump_manager.cc`, `gumps/Mixer_gump.cc`, `gumps/Notebook_gump.cc`, `gumps/Notebook_gump.h`, `gumps/Slider_widget.cc`, `gumps/Stats_gump.cc` | Fix a notebook null-instance call, slider mouse-up, extra stats pages, mixer save and `close_all_gumps` resume | not reported |
| [#214](https://github.com/Danathar/exult/pull/214) | `usecode/ucinternal.cc`, `usecode/useval.cc` | Keep undefined usecode statics across save/load and refuse oversize values | not reported |
| [#215](https://github.com/Danathar/exult/pull/215) | `mapedit/combo.cc`, `mapedit/npclst.h`, `mapedit/objbrowse.cc`, `mapedit/objbrowse.h`, `mapedit/paledit.cc`, `mapedit/shapegroup.cc`, `mapedit/shapelst.h` | Fix Exult Studio combo index, group signal id, palette import hang and group window indices | not reported |
| [#216](https://github.com/Danathar/exult/pull/216) | `exult.cc`, `gumps/Dynamic_container_gump.cc`, `gumps/Dynamic_container_gump.h`, `gumps/Enabled_button.cc`, `gumps/Gump.cc`, `gumps/Gump_manager.cc`, `gumps/ShortcutBar_gump.h`, `mapedit/chunklst.cc`, `mapedit/npclst.cc`, `mapedit/shapedraw.cc`, `shapes/u7drag.cc`, `shapes/u7drag.h` | Harden U7 drag-and-drop text parsing and fix four small gump bugs | not reported |
| [#217](https://github.com/Danathar/exult/pull/217) | `files/Flex.cc`, `files/IFF.cc`, `files/U7file.h`, `flic/playfli.cc` | Bound archive tables and FLIC packets by the data size | not reported |
| [#218](https://github.com/Danathar/exult/pull/218) | `Makefile.am`, `android/Makefile.am`, `content/bg/Makefile.am`, `content/bgkeyring/Makefile.am`, `content/demo/Makefile.am`, `content/islefaq/Makefile.am`, `content/makefile_builder.sh`, `content/si/Makefile.am`, `content/sifixes/Makefile.am`, `content/sifixes/Makefile.mingw`, `data/Makefile.am`, `gumps/Makefile.am`, `macosx/macosx.am`, `mapedit/Makefile.am`, `shapes/Makefile.am`, `tools/compiler/Makefile.am`, `tools/expack.1`, `tools/expack.cc`, `tools/expack.txt`, `tools/ucxt/data/Makefile.am` | Keep out-of-tree build output out of the source tree (`expack -i` takes an output directory) and refuse a build that stale source-tree headers would shadow | not reported |
| [#220](https://github.com/Danathar/exult/pull/220), [#234](https://github.com/Danathar/exult/pull/234) | `files/utils.cc`, `gamemgr/modmgr.cc` | Make `U7rmdir(recursive)` delete the whole tree without following symbolic links; refuse an unsafe mod patch path before deleting | not reported |
| [#227](https://github.com/Danathar/exult/pull/227) | `usecode/ucinternal.cc` | Drop surplus indirect-call arguments instead of writing past the callee's locals | not reported |
| [#229](https://github.com/Danathar/exult/pull/229) | `audio/midi_drivers/timidity/timidity_instrum.cpp`, `audio/midi_drivers/timidity/timidity_resample.cpp` | Pad pre-resampled TiMidity drum buffers with two zeroed samples so the resamplers do not read past the end | not reported |
| [#233](https://github.com/Danathar/exult/pull/233) | `files/utils.cc` | Escape glob wildcards in the directory name before `U7rmdir` lists it, so a mod folder named `*` cannot delete other mods' files | not reported |
