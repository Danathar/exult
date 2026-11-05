// headers/saveinfo_checks.h: checks on the preview block of a saved game.
#include "harness.h"
#include "saveinfo_checks.h"

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
