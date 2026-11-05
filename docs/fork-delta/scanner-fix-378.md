# [#378](https://github.com/Danathar/exult/issues/378)

- **Files:** `mapedit/shapelst.cc`, `files/utils.cc`, `files/utils.h`
- **Reason:** The image editor command in `Shape_chooser::edit_shape()` carried a path built from a mod's `savegame_path` into `system()` with double quotes at most, so a hostile mod could run shell commands. `posix_image_editor_command()` and `windows_image_editor_command()` now quote that path; the user's editor setting stays unquoted. At sync time keep this quoting if upstream's launch code has not changed it
- **Upstream status:** not reported
