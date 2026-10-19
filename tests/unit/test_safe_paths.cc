// is_safe_relative_path in files/utils.cc: archive entry names that must not
// escape the directory they are restored into.
#include "harness.h"
#include "utils.h"

#include <string>
#include <string_view>

TEST(safe_relative_path_accepts_savegame_names) {
	CHECK(is_safe_relative_path("npc.dat"));
	CHECK(is_safe_relative_path("u7ireg00"));
	CHECK(is_safe_relative_path("map01/u7ireg00"));
	CHECK(is_safe_relative_path("map01"));
	CHECK(is_safe_relative_path("GAMEDAT"));
	CHECK(is_safe_relative_path("a/./b"));
	CHECK(is_safe_relative_path("...x"));
	CHECK(is_safe_relative_path("a..b/c"));
}

TEST(safe_relative_path_rejects_escaping_names) {
	CHECK(!is_safe_relative_path(""));
	CHECK(!is_safe_relative_path(".."));
	CHECK(!is_safe_relative_path("../x"));
	CHECK(!is_safe_relative_path("a/../../x"));
	CHECK(!is_safe_relative_path("a/.."));
	CHECK(!is_safe_relative_path("/abs/x"));
	CHECK(!is_safe_relative_path("\\abs\\x"));
	CHECK(!is_safe_relative_path("a\\..\\x"));
	CHECK(!is_safe_relative_path("C:x"));
	CHECK(!is_safe_relative_path(std::string_view("ok\0/../x", 8)));
}
