// Case-insensitive file lookup in files/utils.cc (U7open_in, U7exists,
// U7opendir) on case-sensitive file systems: mod and game files whose
// names use a different case than the one Exult asks for.
#include "harness.h"
#include "exceptions.h"
#include "utils.h"

#include <string>

#ifndef _WIN32

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
