/*
Copyright (C) 2026 The Exult Team

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
*/

// Case-insensitive file lookup in files/utils.cc (U7open_in, U7exists,
// U7opendir) on case-sensitive file systems: mod and game files whose
// names use a different case than the one Exult asks for.
#include "harness.h"
#include "exceptions.h"
#include "utils.h"

#include <string>

#ifndef _WIN32
#	include <sys/resource.h>
#	include <unistd.h>

namespace {
	const char* const scratch = "unit_case_dir";

	void write_file(const std::string& name, const std::string& text) {
		auto out = U7open_out(name.c_str(), true);
		*out << text;
	}

	std::string read_line(const std::string& name) {
		auto        in = U7open_in(name.c_str(), true);
		std::string line;
		std::getline(*in, line);
		return line;
	}

	void make_tree() {
		U7rmdir(scratch, true);
		const std::string root(scratch);
		U7mkdir((root + "/STATIC").c_str(), 0755, true);
		U7mkdir((root + "/patch").c_str(), 0755, true);
		U7mkdir((root + "/Mods").c_str(), 0755, true);
		U7mkdir((root + "/Mods/Keyring").c_str(), 0755, true);
		U7mkdir((root + "/dup").c_str(), 0755, true);
		write_file(root + "/STATIC/mainshp.flx", "mainshp");
		write_file(root + "/patch/U7IFIX3f", "ifix");
		write_file(root + "/Mods/Keyring/Shapes.vga", "shapes");
		write_file(root + "/dup/Abc", "Abc");
		write_file(root + "/dup/ABc", "ABc");
		U7mkdir((root + "/pref/Data").c_str(), 0755, true);
		U7mkdir((root + "/pref/DATA").c_str(), 0755, true);
		U7mkdir((root + "/pref/Data/Sub").c_str(), 0755, true);
		write_file(root + "/pref/Data/item.txt", "Data");
		write_file(root + "/pref/DATA/other.txt", "DATA");
	}
}    // namespace

TEST(case_insensitive_upper_dir_lower_file) {
	make_tree();
	// The old retries only uppercase whole trailing parts, so they try
	// STATIC/MAINSHP.FLX but never STATIC/mainshp.flx.
	const std::string name = std::string(scratch) + "/static/mainshp.flx";
	CHECK(U7exists(name));
	CHECK_EQ(read_line(name), std::string("mainshp"));
	U7rmdir(scratch, true);
}

TEST(case_insensitive_mixed_case_file) {
	make_tree();
	// Superchunk names are built in lower case ("u7ifix3f").
	const std::string name = std::string(scratch) + "/patch/u7ifix3f";
	CHECK(U7exists(name));
	CHECK_EQ(read_line(name), std::string("ifix"));
	U7rmdir(scratch, true);
}

TEST(case_insensitive_mixed_case_dirs) {
	make_tree();
	const std::string dir = std::string(scratch) + "/mods/keyring";
	DIR*              d   = U7opendir(dir.c_str());
	CHECK(d != nullptr);
	if (d != nullptr) {
		closedir(d);
	}
	CHECK(U7exists(dir));
	CHECK_EQ(read_line(dir + "/shapes.vga"), std::string("shapes"));
	U7rmdir(scratch, true);
}

TEST(case_insensitive_prefers_exact_then_sorted) {
	make_tree();
	const std::string root(scratch);
	CHECK_EQ(read_line(root + "/dup/Abc"), std::string("Abc"));
	CHECK_EQ(read_line(root + "/dup/ABc"), std::string("ABc"));
	// No exact match: the first name in sorted order wins ("ABc" < "Abc").
	CHECK_EQ(read_line(root + "/dup/abc"), std::string("ABc"));
	U7rmdir(scratch, true);
}

TEST(case_insensitive_absolute_path) {
	make_tree();
	// Game and mod directories come from the configuration as absolute
	// paths, so the lookup must keep the leading '/'.
	char cwd[4096];
	CHECK(getcwd(cwd, sizeof(cwd)) != nullptr);
	const std::string name = std::string(cwd) + "/" + scratch + "/static/mainshp.flx";
	CHECK(U7exists(name));
	CHECK_EQ(read_line(name), std::string("mainshp"));
	U7rmdir(scratch, true);
}

TEST(case_insensitive_keeps_parent_parts) {
	make_tree();
	const std::string root(scratch);
	CHECK_EQ(read_line(root + "/patch/../static/mainshp.flx"), std::string("mainshp"));
	CHECK_EQ(read_line(root + "/./patch/./u7ifix3f"), std::string("ifix"));
	U7rmdir(scratch, true);
}

TEST(case_insensitive_keeps_exact_directory) {
	make_tree();
	// "Data" exists exactly, so it is used even though "DATA" sorts first;
	// only "Item.txt" needs the case-insensitive match.
	CHECK_EQ(read_line(std::string(scratch) + "/pref/Data/Item.txt"), std::string("Data"));
	DIR* d = U7opendir((std::string(scratch) + "/pref/Data/sub").c_str());
	CHECK(d != nullptr);
	if (d != nullptr) {
		closedir(d);
	}
	U7rmdir(scratch, true);
}

TEST(case_insensitive_matches_whole_names_only) {
	make_tree();
	const std::string root(scratch);
	// A name that is only the start of a real one, or a real one with more
	// after it, is a different file.
	CHECK(!U7exists(root + "/patch/u7ifix3"));
	CHECK(!U7exists(root + "/static/mainshp.flx.bak"));
	CHECK(!U7exists(root + "/stat/mainshp.flx"));
	U7rmdir(scratch, true);
}

TEST(case_insensitive_file_is_not_a_directory) {
	make_tree();
	// A file in the middle of the path cannot be opened as a directory.
	CHECK(!U7exists(std::string(scratch) + "/static/mainshp.flx/extra"));
	U7rmdir(scratch, true);
}

TEST(case_insensitive_closes_directories) {
	make_tree();
	// Each lookup reads a directory; with a low open-file limit a leaked
	// handle per lookup makes the later ones fail.
	rlimit saved;
	CHECK(getrlimit(RLIMIT_NOFILE, &saved) == 0);
	rlimit low = saved;
	low.rlim_cur = 64;
	CHECK(setrlimit(RLIMIT_NOFILE, &low) == 0);
	const std::string name = std::string(scratch) + "/patch/u7ifix3f";
	int found = 0;
	for (int i = 0; i < 200; i++) {
		found += U7exists(name) ? 1 : 0;
	}
	setrlimit(RLIMIT_NOFILE, &saved);
	CHECK_EQ(found, 200);
	U7rmdir(scratch, true);
}

TEST(case_insensitive_missing_still_fails) {
	make_tree();
	const std::string root(scratch);
	CHECK(!U7exists(root + "/static/nothere.flx"));
	CHECK(!U7exists(root + "/nodir/mainshp.flx"));
	CHECK(U7opendir((root + "/nodir").c_str()) == nullptr);
	bool threw = false;
	try {
		U7open_in((root + "/patch/u7ifix40").c_str());
	} catch (const file_open_exception&) {
		threw = true;
	}
	CHECK(threw);
	U7rmdir(scratch, true);
}

#endif
