# [#326](https://github.com/Danathar/exult/issues/326)

- **Files:** `imagewin/imagewin.cc`
- **Reason:** Stop `VideoModeOK` and `static_init` dereferencing the null display modes SDL returns when no display is connected (fullscreen toggle after a Wayland output is unplugged)
- **Upstream status:** not reported
