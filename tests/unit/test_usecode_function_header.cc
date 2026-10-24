// usecode_function_header_fits() (usecode/ucfunction_header.h): the check
// Usecode_function runs so that Stack_frame never reads a function header
// past the end of a short body.
#include "harness.h"
#include "usecode/ucfunction_header.h"

#include <vector>

namespace {
	bool fits(const std::vector<unsigned char>& body, bool extended) {
		return usecode_function_header_fits(body.data(), body.size(), extended);
	}
}    // namespace

TEST(ucfunction_header_valid_short_format) {
	// data_len 2, text "a\0", 1 arg, 2 locals, 1 extern (0x0401), code: RET.
	const std::vector<unsigned char> body = {0x02, 0x00, 'a', 0x00, 0x01, 0x00, 0x02, 0x00, 0x01, 0x00, 0x01, 0x04, 0x25};
	CHECK(fits(body, false));
	// The extern table may end exactly at the end of the body.
	CHECK(fits(std::vector<unsigned char>(body.begin(), body.end() - 1), false));
}

TEST(ucfunction_header_valid_extended_format) {
	const std::vector<unsigned char> body
			= {0x01, 0x00, 0x00, 0x00, 'x', 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x06, 0x25};
	CHECK(fits(body, true));
}

TEST(ucfunction_header_rejects_data_len_past_end) {
	// The record from the issue: len 4, body 10 00 00 00 (data_len 16).
	CHECK(!fits({0x10, 0x00, 0x00, 0x00}, false));
	// Extended: a 32-bit length that would be negative as a signed int.
	CHECK(!fits({0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, true));
	CHECK(!fits({0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, true));
}

TEST(ucfunction_header_rejects_missing_counts) {
	CHECK(!fits({}, false));
	CHECK(!fits({0x00}, false));
	CHECK(!fits({0x00, 0x00, 0x00, 0x00}, true));
	// data_len 0, but only 5 of the 6 count bytes.
	CHECK(!fits({0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, false));
	CHECK(!fits({0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, true));
	// All 6 count bytes present, no externs, no code.
	CHECK(fits({0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}, false));
}

TEST(ucfunction_header_rejects_externs_past_end) {
	// 2 externs announced, room for one.
	CHECK(!fits({0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x04}, false));
	CHECK(!fits({0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x04}, true));
	// 0xffff externs: 2 * count must not wrap.
	CHECK(!fits({0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0x01, 0x04}, false));
}
