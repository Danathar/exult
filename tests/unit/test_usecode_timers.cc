// Timer list in 'gamedat/usecode.dat' (usecode/uctimers.h): each timer
// number is saved in 16 bits and 0xffff ends the list, so numbers outside
// 0-0xfffe must never be written, and the saved position that follows the
// list must read back unchanged.
#include "harness.h"
#include "usecode/uctimers.h"

#include <map>
#include <sstream>
#include <string>

namespace {
	// Writes the timers followed by a saved position, as the save code does.
	std::string save(const std::map<int, uint32>& timers) {
		std::ostringstream os;
		OStreamDataSource  out(&os);
		write_usecode_timers(out, timers);
		out.write2(1000);    // saved_pos.tx
		out.write2(2000);    // saved_pos.ty
		out.write2(5);       // saved_pos.tz
		out.write2(0);       // saved_map
		return os.str();
	}

	void check_saved_pos(std::istream& in) {
		CHECK_EQ(int(little_endian::Read2(in)), 1000);
		CHECK_EQ(int(little_endian::Read2(in)), 2000);
		CHECK_EQ(int(little_endian::Read2(in)), 5);
		CHECK_EQ(int(little_endian::Read2(in)), 0);
		CHECK(in.good());
	}
}    // namespace

TEST(usecode_timers_saveable_range) {
	CHECK(is_saveable_usecode_timer(0));
	CHECK(is_saveable_usecode_timer(3));
	CHECK(is_saveable_usecode_timer(0xfffe));
	CHECK(!is_saveable_usecode_timer(-1));
	CHECK(!is_saveable_usecode_timer(0xffff));
	CHECK(!is_saveable_usecode_timer(70000));
}

TEST(usecode_timers_round_trip) {
	const std::map<int, uint32> timers = {{0, 11}, {3, 22}, {65534, 33}};
	std::istringstream          in(save(timers));
	std::map<int, uint32>       loaded;
	read_usecode_timers(in, loaded);
	CHECK(loaded == timers);
	check_saved_pos(in);
}

TEST(usecode_timers_skip_unused_and_unsaveable) {
	// -1 sorts first and would otherwise be written as the end marker.
	const std::map<int, uint32> timers = {{-1, 5}, {3, 7}, {4, 0}, {0xffff, 9}, {70000, 8}};
	std::istringstream          in(save(timers));
	std::map<int, uint32>       loaded;
	read_usecode_timers(in, loaded);
	const std::map<int, uint32> expected = {{3, 7}};
	CHECK(loaded == expected);
	check_saved_pos(in);
}

TEST(usecode_timers_empty_list) {
	std::istringstream    in(save({}));
	std::map<int, uint32> loaded;
	read_usecode_timers(in, loaded);
	CHECK(loaded.empty());
	check_saved_pos(in);
}

TEST(usecode_timers_truncated_list_stops) {
	// One timer, then the data ends without the end marker.
	std::string           data = save({{3, 7}}).substr(0, 6);
	std::istringstream    in(data);
	std::map<int, uint32> loaded;
	read_usecode_timers(in, loaded);
	CHECK_EQ(loaded.size(), size_t(1));
	CHECK(!in.good());
}
