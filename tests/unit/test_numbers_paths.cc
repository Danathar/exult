// Integer helpers, path helpers and system-path expansion in files/utils.cc.
#include "harness.h"
#include "utils.h"

#include <cstring>
#include <sstream>
#include <string>

TEST(log2_msb32_fgepow2) {
	CHECK_EQ(Log2(0), 0);
	CHECK_EQ(Log2(1), 0);
	CHECK_EQ(Log2(2), 1);
	CHECK_EQ(Log2(255), 7);
	CHECK_EQ(Log2(256), 8);
	CHECK_EQ(msb32(0), 0u);
	CHECK_EQ(msb32(1), 1u);
	CHECK_EQ(msb32(100), 64u);
	CHECK_EQ(msb32(0x80000001u), 0x80000000u);
	CHECK_EQ(fgepow2(0), 0);
	CHECK_EQ(fgepow2(1), 1);
	CHECK_EQ(fgepow2(5), 8);
	CHECK_EQ(fgepow2(64), 64);
	CHECK_EQ(fgepow2(65), 128);
}

TEST(filename_and_directory_from_path) {
	CHECK_EQ(std::string(get_filename_from_path("a/b/c.flx")), std::string("c.flx"));
	CHECK_EQ(std::string(get_filename_from_path("c.flx")), std::string("c.flx"));
	CHECK_EQ(std::string(get_filename_from_path("a\\b\\c.flx")), std::string("c.flx"));
	CHECK_EQ(std::string(get_directory_from_path("a/b/c.flx")), std::string("a/b"));
	CHECK_EQ(std::string(get_directory_from_path("c.flx")), std::string(""));
}

TEST(system_path_expansion) {
	clear_system_path("<TESTDATA>");
	CHECK(!is_system_path_defined("<TESTDATA>"));
	add_system_path("<TESTDATA>", "/opt/exult/data/");    // trailing slash is dropped
	CHECK(is_system_path_defined("<TESTDATA>"));
	CHECK_EQ(get_system_path("<TESTDATA>/exult.flx"), std::string("/opt/exult/data/exult.flx"));
	CHECK_EQ(get_system_path("plain/path"), std::string("plain/path"));

	clone_system_path("<TESTCOPY>", "<TESTDATA>");
	CHECK_EQ(get_system_path("<TESTCOPY>/x"), std::string("/opt/exult/data/x"));

	// Nested expansion.
	add_system_path("<TESTNEST>", "<TESTDATA>/sub");
	CHECK_EQ(get_system_path("<TESTNEST>/y"), std::string("/opt/exult/data/sub/y"));

	// An empty value clears the path.
	add_system_path("<TESTCOPY>", "");
	CHECK(!is_system_path_defined("<TESTCOPY>"));

	// store/reset round trip.
	store_system_paths();
	clear_system_path("<TESTDATA>");
	CHECK(!is_system_path_defined("<TESTDATA>"));
	reset_system_paths();
	CHECK(is_system_path_defined("<TESTDATA>"));

	clear_system_path("<TESTDATA>");
	clear_system_path("<TESTNEST>");
}

TEST(get_mapped_name) {
	char out[128];
	CHECK_EQ(std::string(Get_mapped_name("<GAMEDAT>/ireg00", 0, out)), std::string("<GAMEDAT>/ireg00"));
	const std::string mapped(Get_mapped_name("<GAMEDAT>/ireg", 3, out));
	CHECK(mapped.find("03") != std::string::npos);
	CHECK(mapped.find("<GAMEDAT>/") == 0);
	CHECK(mapped.rfind("/ireg") == mapped.size() - 5);
}

TEST(read_write_int_and_str) {
	std::stringstream ss;
	WriteInt(ss, -42);
	WriteInt(ss, 7u);
	WriteStr(ss, "hello");
	WriteInt(ss, 9, true);
	CHECK_EQ(ss.str(), std::string("-42/7/hello/9\n"));
	std::stringstream in(ss.str());
	CHECK_EQ(ReadInt(in), -42);
	CHECK_EQ(ReadUInt(in), 7u);
	CHECK_EQ(ReadStr(in), std::string("hello"));
	CHECK_EQ(ReadInt(in), 9);
	std::stringstream bad("abc");
	CHECK_EQ(ReadInt(bad, 5), 5);
}

TEST(get_file_size_of_stream) {
	std::stringstream ss("0123456789");
	CHECK_EQ(get_file_size(ss), size_t(10));
}
