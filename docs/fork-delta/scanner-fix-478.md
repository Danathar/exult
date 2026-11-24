# [scanner/fix-478](https://github.com/Danathar/exult/pull/new/scanner/fix-478)

- **Files:** `files/utils.cc`
- **Reason:** `shell32_wrapper` loaded `shell32.dll` with `LoadLibrary`, which searches the application directory before System32, so a planted DLL next to `exult.exe` could be loaded. It now uses `LoadLibraryEx` with `LOAD_LIBRARY_SEARCH_SYSTEM32`, as upstream exult/exult#1089 does. At sync time take upstream's version and delete this file
- **Upstream status:** fixed upstream in 656700524b179cf28a32f209f0977f7dd232d41f
