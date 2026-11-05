// usecode/ucinstruction_checks.h: the checks Usecode_internal::run() makes so
// that a damaged script is stopped, not run past the end of its code or the
// start of its locals.
#include "harness.h"
#include "usecode/ucinstruction_checks.h"

namespace {
	// UC_PUSHI (0x1f) with its 2 operand bytes.
	constexpr int           pushi_length = 3;
	constexpr unsigned char code[]       = {0x1f, 0x34, 0x12};
}    // namespace

TEST(usecode_instruction_fits_when_it_ends_at_the_end_of_the_code) {
	CHECK(usecode_instruction_fits(code, code + 3, pushi_length));
}

TEST(usecode_instruction_fits_with_code_left_over) {
	CHECK(usecode_instruction_fits(code, code + 3, 1));
}

TEST(usecode_instruction_fits_rejects_missing_operands) {
	// The function ends right after the opcode, or after 1 of the 2 operands.
	CHECK(!usecode_instruction_fits(code, code + 1, pushi_length));
	CHECK(!usecode_instruction_fits(code, code + 2, pushi_length));
}

TEST(usecode_instruction_fits_at_the_last_byte) {
	// A one-byte instruction is fine there; a longer one is not.
	CHECK(usecode_instruction_fits(code + 2, code + 3, 1));
	CHECK(!usecode_instruction_fits(code + 2, code + 3, pushi_length));
}

TEST(usecode_instruction_fits_accepts_opcode_past_the_table) {
	// get_opcode_length() gives 0 for an opcode it does not know; run() then
	// reports that opcode itself.
	CHECK(usecode_instruction_fits(code + 2, code + 3, 0));
}

TEST(usecode_has_this_needs_an_argument) {
	CHECK(!usecode_has_this(0));
	CHECK(usecode_has_this(1));
	CHECK(usecode_has_this(2));
}
