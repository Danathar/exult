// headers/saveinfo_checks.h: checks on the preview block of a saved game.
#include "harness.h"
#include "saveinfo_checks.h"
#include "utils.h"

#include <cstring>

TEST(index_in_range_accepts_valid_kinds) {
	CHECK(index_in_range(0, 9));
	CHECK(index_in_range(8, 9));
}

TEST(index_in_range_rejects_negative_and_too_large) {
	CHECK(!index_in_range(-1, 9));
	CHECK(!index_in_range(-32768, 9));
	CHECK(!index_in_range(9, 9));
	CHECK(!index_in_range(32767, 9));
}

TEST(saved_party_alloc_count_zero_means_no_party) {
	CHECK(saved_party_alloc_count(0) == 0);
	CHECK(saved_party_alloc_count(-1) == 0);
	CHECK(saved_party_alloc_count(1) == 1);
	CHECK(saved_party_alloc_count(8) == 8);
}

TEST(terminate_name_stops_unterminated_names) {
	char name[18];
	std::memset(name, 'A', sizeof(name));
	terminate_name(name, sizeof(name));
	CHECK(std::strlen(name) == 17);
}

TEST(terminate_name_keeps_short_names) {
	char name[18] = "Avatar";
	terminate_name(name, sizeof(name));
	CHECK(std::strcmp(name, "Avatar") == 0);
}

TEST(level2_file_path_puts_map_files_inside_their_folder) {
	CHECK(level2_file_path("<GAMEDAT>/map01", "u7ireg00") == "<GAMEDAT>/map01/u7ireg00");
}

TEST(level2_file_path_keeps_the_gamedat_entry_unchanged) {
	CHECK(level2_file_path("<GAMEDAT>/", "npc.dat") == "<GAMEDAT>/npc.dat");
	CHECK(level2_file_path("", "npc.dat") == "npc.dat");
}

TEST(level2_file_path_cannot_join_two_safe_names_into_a_parent_step) {
	CHECK(is_safe_relative_path("."));
	CHECK(is_safe_relative_path("./x"));
	const std::string joined = level2_file_path(".", "./x");
	CHECK(joined == "././x");
	CHECK(is_safe_relative_path(joined));
}

TEST(parse_note_time_reads_full_text) {
	int d = 0;
	int h = 0;
	int m = 0;
	CHECK(parse_note_time("3:14:15", d, h, m));
	CHECK(d == 3 && h == 14 && m == 15);
}

TEST(parse_note_time_keeps_defaults_when_damaged) {
	int d = 7;
	int h = 8;
	int m = 9;
	CHECK(!parse_note_time("", d, h, m));
	CHECK(!parse_note_time("3:14", d, h, m));
	CHECK(!parse_note_time("abc", d, h, m));
	CHECK(d == 7 && h == 8 && m == 9);
}

TEST(parse_note_place_needs_both_numbers) {
	int x = -1;
	int y = -2;
	CHECK(!parse_note_place("12", x, y));
	CHECK(!parse_note_place("", x, y));
	CHECK(x == -1 && y == -2);
	CHECK(parse_note_place("12:34", x, y));
	CHECK(x == 12 && y == 34);
}

TEST(parse_note_gflag_rejects_non_numbers) {
	int g = -1;
	CHECK(!parse_note_gflag("zz", g));
	CHECK(g == -1);
	CHECK(parse_note_gflag("42", g));
	CHECK(g == 42);
}
