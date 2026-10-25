# [scanner/fix-325](https://github.com/Danathar/exult/issues/325)

- **Files:** `imagewin/imagewin.cc`, `imagewin/imagewin.h`, `exult.cc`
- **Reason:** Lay out and present fullscreen at the display's real pixel size (desktop mode, or the window's size once fullscreen) instead of the windowed size, and re-lay out on a fullscreen pixel-size change, so async fullscreen under a compositor is neither letterboxed nor stretched
- **Upstream status:** not reported
