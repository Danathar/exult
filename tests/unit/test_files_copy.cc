// U7copy (files/utils.cc): copying an empty file must succeed and give an
// empty destination; non-empty copies are byte-for-byte. Works in the CWD
// (run-unit-tests.sh runs from the build directory).
#include "harness.h"
#include "exceptions.h"
#include "utils.h"

#include <cstdio>
#include <fstream>
#include <iterator>
#include <string>

namespace {
	std::string read_all(const char* name) {
		std::ifstream in(name, std::ios::binary);
		return std::string(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
	}
}    // namespace

TEST(copy_empty_file) {
	const char* const src = "unit_copy_empty.src";
	const char* const dst = "unit_copy_empty.dst";
	{ std::ofstream out(src, std::ios::binary); }

	bool threw = false;
	try {
		U7copy(src, dst);
	} catch (const exult_exception&) {
		threw = true;
	}
	CHECK(!threw);
	CHECK(U7exists(dst));
	CHECK(read_all(dst).empty());

	std::remove(src);
	std::remove(dst);
}

TEST(copy_nonempty_file) {
	const char* const src = "unit_copy_data.src";
	const char* const dst = "unit_copy_data.dst";
	const std::string data("a\0b\nc", 5);
	{
		std::ofstream out(src, std::ios::binary);
		out << data;
	}

	bool threw = false;
	try {
		U7copy(src, dst);
	} catch (const exult_exception&) {
		threw = true;
	}
	CHECK(!threw);
	CHECK(read_all(dst) == data);

	std::remove(src);
	std::remove(dst);
}
