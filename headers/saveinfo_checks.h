// Small checks for values read from a saved game's preview block. The block
// comes from a file, so it is untrusted. Header-only and free of SDL so the
// unit tests can build it.
#ifndef EXULT_SAVEINFO_CHECKS_H
#define EXULT_SAVEINFO_CHECKS_H

#include <cstddef>
#include <string>
#include <string_view>

// Path of one file packed inside a level 2 save entry. Both names come from the
// file and are checked one at a time, so the '/' must be here: without it "."
// and "./x" would join into "../x", which neither check can see.
inline std::string level2_file_path(std::string_view dir, std::string_view name) {
	std::string path(dir);
	if (!path.empty() && path.back() != '/') {
		path += '/';
	}
	path += name;
	return path;
}

// True if 'kind' can index an array of 'count' entries (0 <= kind < count).
inline bool index_in_range(int kind, int count) {
	return kind >= 0 && kind < count;
}

// Number of party entries to allocate for a saved party size. A size of 0
// gives 0, meaning "no party": the caller leaves its pointer null.
inline std::size_t saved_party_alloc_count(int party_size) {
	return party_size > 0 ? static_cast<std::size_t>(party_size) : 0;
}

// Make sure a fixed-size name buffer ends in a zero byte.
inline void terminate_name(char* name, std::size_t size) {
	if (size > 0) {
		name[size - 1] = 0;
	}
}

#endif
