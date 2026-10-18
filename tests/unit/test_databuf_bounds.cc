// Short-read handling in IBufferDataView (files/databuf.h): what a reader of a
// truncated buffer sees. Callers that parse shapes, Flex entries and saved
// games check fail()/good() after reading, so these flags and the read
// position after a short read are the contract under test.
//
// Every view below covers only the first bytes of a larger array, so a read
// that ignores the view's size stays inside the array and shows up as a
// wrong value rather than as undefined behaviour.
#include "databuf.h"
#include "harness.h"

#include <cstring>
#include <memory>
#include <string>

TEST(databuf_short_read1_fails_and_advances) {
	const unsigned char raw[8] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88};
	IBufferDataView     one(raw, 1);
	CHECK_EQ(unsigned(one.read1()), 0x11u);
	CHECK(!one.fail());
	CHECK_EQ(unsigned(one.read1()), 0xFFFFFFFFu);
	CHECK(one.fail());
	CHECK(!one.good());
	CHECK_EQ(one.getPos(), size_t(2));
	CHECK(one.eof());
}

TEST(databuf_peek_at_end_fails_without_advancing) {
	const unsigned char raw[8] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88};
	IBufferDataView     in(raw, 1);
	CHECK_EQ(unsigned(in.peek()), 0x11u);
	in.read1();
	CHECK(!in.fail());
	CHECK_EQ(unsigned(in.peek()), 0xFFFFFFFFu);
	CHECK(in.fail());
	CHECK_EQ(in.getPos(), size_t(1));
}

TEST(databuf_short_read2_fails_and_advances) {
	const unsigned char raw[8] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88};
	IBufferDataView     in(raw, 1);
	CHECK_EQ(unsigned(in.read2()), 0xFFFFu);
	CHECK(in.fail());
	CHECK(!in.good());
	CHECK_EQ(in.getPos(), size_t(2));
	// The position is past the end, which still counts as end of data.
	CHECK(in.eof());
}

TEST(databuf_short_read2high_fails_and_advances) {
	const unsigned char raw[8] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88};
	IBufferDataView     in(raw, 1);
	CHECK_EQ(unsigned(in.read2high()), 0xFFFFu);
	CHECK(in.fail());
	CHECK(!in.good());
	CHECK_EQ(in.getPos(), size_t(2));
	CHECK(in.eof());
}

TEST(databuf_short_read4_fails_and_advances) {
	const unsigned char raw[8] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88};
	IBufferDataView     in(raw, 3);
	CHECK_EQ(unsigned(in.read4()), 0xFFFFFFFFu);
	CHECK(in.fail());
	CHECK(!in.good());
	CHECK_EQ(in.getPos(), size_t(4));
	CHECK(in.eof());
}

TEST(databuf_short_read4high_fails_and_advances) {
	const unsigned char raw[8] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88};
	IBufferDataView     in(raw, 3);
	CHECK_EQ(unsigned(in.read4high()), 0xFFFFFFFFu);
	CHECK(in.fail());
	CHECK(!in.good());
	CHECK_EQ(in.getPos(), size_t(4));
	CHECK(in.eof());
}

TEST(databuf_exact_fit_reads_do_not_fail) {
	const unsigned char raw[8] = {0x78, 0x56, 0x34, 0x12, 0x01, 0x02, 0x03, 0x04};
	IBufferDataView     le(raw, 4);
	CHECK_EQ(unsigned(le.read4()), 0x12345678u);
	CHECK(!le.fail());
	CHECK(le.eof());
	// At the end without a failed read: not failed, but not good either.
	CHECK(!le.good());

	IBufferDataView be(raw, 2);
	CHECK_EQ(unsigned(be.read2high()), 0x7856u);
	CHECK(!be.fail());
	CHECK(be.eof());
}

TEST(databuf_short_read_into_buffer_copies_only_available) {
	const unsigned char raw[8] = {'a', 'b', 'c', 'X', 'X', 'X', 'X', 'X'};
	IBufferDataView     in(raw, 3);
	unsigned char       dest[5];
	std::memset(dest, '?', sizeof(dest));
	in.read(dest, sizeof(dest));
	CHECK_EQ(dest[0], 'a');
	CHECK_EQ(dest[2], 'c');
	// Bytes past the view's end are left untouched in the destination.
	CHECK_EQ(dest[3], '?');
	CHECK_EQ(dest[4], '?');
	CHECK(in.fail());
	CHECK_EQ(in.getPos(), size_t(5));
}

TEST(databuf_short_read_into_string_stops_at_end) {
	const unsigned char raw[8] = {'a', 'b', 'c', 'X', 'X', 'X', 'X', 'X'};
	IBufferDataView     in(raw, 3);
	std::string         s;
	in.read(s, 5);
	CHECK_EQ(s, std::string("abc"));
	CHECK(in.fail());
	CHECK_EQ(in.getPos(), size_t(5));
}

TEST(databuf_clear_error_resets_fail) {
	const unsigned char raw[8] = {0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88};
	IBufferDataView     in(raw, 4);
	in.read4();
	in.read1();
	CHECK(in.fail());
	in.clear_error();
	CHECK(!in.fail());
	// Rewinding after clear_error() makes the view usable again.
	in.seek(0);
	CHECK(in.good());
	CHECK_EQ(unsigned(in.read2()), 0x2211u);
}

TEST(databuf_empty_view_is_bad) {
	const unsigned char raw[1] = {0x42};
	IBufferDataView     empty(raw, 0);
	CHECK(empty.bad());
	CHECK(empty.fail());
	CHECK(!empty.good());

	IBufferDataView none(nullptr, 0);
	CHECK(none.bad());
	CHECK(!none.good());

	IBufferDataView one(raw, 1);
	CHECK(!one.bad());
	CHECK(one.good());
}

TEST(databuf_make_source_clamps_to_available) {
	const unsigned char raw[8] = {0x01, 0x02, 0x03, 0x04, 0xEE, 0xEE, 0xEE, 0xEE};
	IBufferDataView     in(raw, 4);
	in.read1();
	auto sub = in.makeSource(10);
	CHECK_EQ(sub->getSize(), size_t(3));
	CHECK_EQ(in.getPos(), size_t(4));
	CHECK_EQ(unsigned(sub->read1()), 0x02u);
	CHECK_EQ(unsigned(sub->read2()), 0x0403u);
	CHECK(!sub->fail());
	// The sub-view ends where the parent did, not at the requested length.
	CHECK_EQ(unsigned(sub->read1()), 0xFFFFFFFFu);
	CHECK(sub->fail());
}
