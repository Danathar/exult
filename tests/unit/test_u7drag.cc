// Drag-and-drop text parsing in shapes/u7drag.cc (malformed input must be rejected).
// The product source is included directly: tests/run-unit-tests.sh builds tests/unit/*.cc only.
#include "harness.h"
#include "shapes/u7drag.cc"

#include <cstring>
#include <memory>

static const unsigned char* U(const char* s) {
	return reinterpret_cast<const unsigned char*>(s);
}

TEST(u7drag_shape_round_trip) {
	unsigned char buf[U7DND_DATA_LENGTH(3)];
	CHECK(Store_u7_shapeid(buf, 0, 1234, 7) > 0);
	CHECK(Is_u7_shapeid(buf));
	int file = -1, shape = -1, frame = -1;
	CHECK(Get_u7_shapeid(buf, file, shape, frame));
	CHECK_EQ(file, 0);
	CHECK_EQ(shape, 1234);
	CHECK_EQ(frame, 7);
}

TEST(u7drag_shape_malformed_leaves_outputs) {
	int file = 11, shape = 22, frame = 33;
	CHECK(Is_u7_shapeid(U("file:///U7SHAPEID.")));
	CHECK(!Get_u7_shapeid(U("file:///U7SHAPEID."), file, shape, frame));
	CHECK(!Get_u7_shapeid(U("file:///U7SHAPEID.1.2"), file, shape, frame));
	CHECK(!Get_u7_shapeid(U("file:///U7SHAPEID.a.b.c"), file, shape, frame));
	CHECK(!Get_u7_shapeid(U("no dot here"), file, shape, frame));
	CHECK_EQ(file, 11);
	CHECK_EQ(shape, 22);
	CHECK_EQ(frame, 33);
}

TEST(u7drag_chunk_and_npc_round_trip_and_malformed) {
	unsigned char buf[U7DND_DATA_LENGTH(1)];
	int           v = -1;
	Store_u7_chunkid(buf, 0xabcd);
	CHECK(Is_u7_chunkid(buf));
	CHECK(Get_u7_chunkid(buf, v));
	CHECK_EQ(v, 0xabcd);
	Store_u7_npcid(buf, 321);
	CHECK(Is_u7_npcid(buf));
	CHECK(Get_u7_npcid(buf, v));
	CHECK_EQ(v, 321);

	v = 5;
	CHECK(!Get_u7_chunkid(U("file:///U7CHUNKID."), v));
	CHECK(!Get_u7_chunkid(U("file:///U7CHUNKID.x"), v));
	CHECK(!Get_u7_npcid(U("file:///U7NPCID."), v));
	CHECK(!Get_u7_npcid(U("file:///U7NPCID.-"), v));
	CHECK_EQ(v, 5);
}

TEST(u7drag_is_checks_do_not_read_past_short_strings) {
	CHECK(!Is_u7_shapeid(U("")));
	CHECK(!Is_u7_comboid(U("file:")));
	CHECK(!Is_u7_npcid(U("U7")));
	CHECK(Is_u7_npcid(U("/U7NPCID.4")));    // The prefix is accepted with or without "file://".
	CHECK(!Is_u7_npcid(U("U7NPCID.4")));
}

TEST(u7drag_combo_round_trip) {
	U7_combo_data in[2] = {{1, 2, 3, 400, 5}, {-1, -2, 0, 65535, 255}};
	unsigned char buf[U7DND_DATA_LENGTH(5 + 5 * 2)];
	CHECK(Store_u7_comboid(buf, 3, 4, 1, 2, 2, in) > 0);
	CHECK(Is_u7_comboid(buf));
	int                              xt = -1, yt = -1, right = -1, below = -1, cnt = -1;
	U7_combo_data*                   ents = nullptr;
	CHECK(Get_u7_comboid(buf, xt, yt, right, below, cnt, ents));
	std::unique_ptr<U7_combo_data[]> owner(ents);
	CHECK_EQ(xt, 3);
	CHECK_EQ(yt, 4);
	CHECK_EQ(right, 1);
	CHECK_EQ(below, 2);
	CHECK_EQ(cnt, 2);
	CHECK(ents != nullptr);
	if (ents) {
		for (int i = 0; i < 2; i++) {
			CHECK_EQ(ents[i].tx, in[i].tx);
			CHECK_EQ(ents[i].ty, in[i].ty);
			CHECK_EQ(ents[i].tz, in[i].tz);
			CHECK_EQ(ents[i].shape, in[i].shape);
			CHECK_EQ(ents[i].frame, in[i].frame);
		}
	}
}

TEST(u7drag_combo_empty_round_trip) {
	unsigned char buf[U7DND_DATA_LENGTH(5)];
	CHECK(Store_u7_comboid(buf, 1, 1, 0, 0, 0, nullptr) > 0);
	int            xt = -1, yt = -1, right = -1, below = -1, cnt = -1;
	U7_combo_data* ents = nullptr;
	CHECK(Get_u7_comboid(buf, xt, yt, right, below, cnt, ents));
	std::unique_ptr<U7_combo_data[]> owner(ents);
	CHECK_EQ(cnt, 0);
}

TEST(u7drag_combo_malformed_rejected) {
	const char* const bad[] = {
			"file:///U7COMBOID.",                                // Nothing after the prefix.
			"file:///U7COMBOID.1.1.0.0",                         // Header too short.
			"file:///U7COMBOID.1.1.0.0.100000.0.0.0.5.0",        // Count too large for the data and over the cap.
			"file:///U7COMBOID.1.1.0.0.-1",                      // Negative count.
			"file:///U7COMBOID.1.1.0.0.2.0.0.0.5.0",             // Count 2, only one entry.
			"file:///U7COMBOID.1.1.0.0.1.0.0.0.5",               // Truncated entry.
			"file:///U7COMBOID.1.1.0.0.65536",                   // Over 0xffff.
			"file:///U7COMBOID.1.1.0.0.1.a.b.c.d.e",             // Non-numeric entry.
	};
	for (const char* s : bad) {
		int            xt = 0, yt = 0, right = 0, below = 0, cnt = 99;
		U7_combo_data* ents = reinterpret_cast<U7_combo_data*>(&cnt);    // Must be reset to nullptr.
		CHECK(!Get_u7_comboid(U(s), xt, yt, right, below, cnt, ents));
		CHECK_EQ(cnt, 0);
		CHECK(ents == nullptr);
	}
}
