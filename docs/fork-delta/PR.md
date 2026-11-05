# PR_NUM

- **Files:** `gamedat.cc`, `shapeid.cc`, `Makefile.am`, `headers/saveinfo_checks.h`
- **Reason:** `read_saveinfo` trusted the preview block of a save file. A shape file number outside the known range indexed `shape_cache` before `Shape_manager::cache_shape` checked it, a party size of 0 left `party[0]` out of bounds, and an 18-byte name could have no zero byte. `cache_shape` and `ShapeID::get_num_frames` now refuse a shape file number below 0 or too large, `read_saveinfo` leaves `party` null when the party size is 0, and it forces a zero byte at the end of each name. The save format is unchanged. At sync time keep these checks if upstream's code has not added its own
- **Upstream status:** not reported
