// TileRect / Block geometry from rect.h.
#include "harness.h"
#include "exult_constants.h"
#include "rect.h"

TEST(tilerect_has_point_edges) {
	const TileRect r(10, 20, 5, 4);
	CHECK(r.has_point(10, 20));
	CHECK(r.has_point(14, 23));
	CHECK(!r.has_point(15, 23));
	CHECK(!r.has_point(14, 24));
	CHECK(!r.has_point(9, 20));
}

TEST(tilerect_add_and_intersect) {
	const TileRect a(0, 0, 10, 10);
	const TileRect b(5, 5, 10, 10);
	CHECK(a.add(b) == TileRect(0, 0, 15, 15));
	CHECK(a.intersect(b) == TileRect(5, 5, 5, 5));
	CHECK(a.intersects(b));
	CHECK(!a.intersects(TileRect(10, 0, 3, 3)));    // touching edge only
}

TEST(tilerect_shift_enlarge_distance) {
	TileRect r(10, 10, 4, 4);
	r.shift(-3, 2);
	CHECK(r == TileRect(7, 12, 4, 4));
	r.enlarge(1);
	CHECK(r == TileRect(6, 11, 6, 6));
	CHECK_EQ(r.distance(6, 11), 0);
	CHECK_EQ(r.distance(0, 11), 6);
	CHECK_EQ(r.distance(11, 16), 0);
	CHECK_EQ(r.distance(20, 16), 9);
}

TEST(tilerect_bool_and_equality) {
	CHECK(!bool(TileRect(0, 0, 0, 0)));
	CHECK(bool(TileRect(0, 0, 0, 1)));
	CHECK(TileRect(1, 2, 3, 4) != TileRect(1, 2, 3, 5));
}

TEST(world_wrap_points) {
	const TileRect r(c_num_tiles - 2, 0, 5, 5);    // wraps past the east edge
	CHECK(r.has_world_point(c_num_tiles - 1, 0));
	CHECK(r.has_world_point(2, 4));
	CHECK(!r.has_world_point(3, 0));
	CHECK(!r.has_world_point(c_num_tiles - 3, 0));
	CHECK(!r.has_world_point(0, 5));
}

TEST(block_has_point) {
	const Block b(1, 2, 3, 4, 5, 6);
	CHECK(b.has_point(1, 2, 3));
	CHECK(b.has_point(4, 6, 8));
	CHECK(!b.has_point(5, 2, 3));
	CHECK(!b.has_point(1, 2, 9));
	CHECK(b.has_world_point(2, 3, 4));
}
