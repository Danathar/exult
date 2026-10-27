# [scanner/fix-357](https://github.com/Danathar/exult/tree/scanner/fix-357)

- **Files:** `docs/Makefile.am`
- **Reason:** Ship `exult_intrinsics.md` in `EXTRA_DIST`; upstream d89d9da80 replaced `exult_intrinsics.txt` with it but still lists the removed `.txt`, which breaks `make dist`
- **Upstream status:** not reported
