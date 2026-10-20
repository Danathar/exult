// File helpers in files/utils.cc / listfiles.cc and the stream-based data
// sources in files/databuf.h. Works in a scratch directory under the CWD
// (run-unit-tests.sh runs from the build directory).
#include "harness.h"
#include "databuf.h"
#include "exceptions.h"
#include "listfiles.h"
#include "utils.h"

#include <algorithm>
#include <cstdio>
#include <sstream>
#include <string>

#ifndef _WIN32
#	include <sys/stat.h>
#	include <unistd.h>
#endif

namespace {
	const char* const scratch = "unit_scratch_dir";

	bool contains_name(const FileList& files, const std::string& name) {
		return std::any_of(files.begin(), files.end(), [&](const std::string& f) {
			return std::string(get_filename_from_path(f)) == name;
		});
	}
}    // namespace

TEST(file_helpers_roundtrip) {
	U7rmdir(scratch, false);
	CHECK(!U7exists(scratch));
	CHECK_EQ(U7mkdir(scratch), 0);
	CHECK(U7exists(scratch));

	const std::string file = std::string(scratch) + "/data.txt";
	{
		auto out = U7open_out(file.c_str(), true);
		*out << "hello\nworld\n";
	}
	CHECK(U7exists(file));
	{
		auto        in = U7open_in(file.c_str(), true);
		std::string line;
		std::getline(*in, line);
		CHECK_EQ(line, std::string("hello"));
	}

	// Copy, then list the directory.
	const std::string copy = std::string(scratch) + "/copy.txt";
	U7copy(file.c_str(), copy.c_str());
	CHECK(U7exists(copy));
	FileList files;
	U7ListFiles(std::string(scratch) + "/*.txt", files, true);
	CHECK_EQ(files.size(), size_t(2));
	CHECK(contains_name(files, "data.txt"));
	CHECK(contains_name(files, "copy.txt"));

	// Nested directory creation with parents.
	const std::string nested = std::string(scratch) + "/a/b";
	CHECK_EQ(U7mkdir(nested.c_str(), 0755, true), 0);
	CHECK(U7exists(nested));
	CHECK_EQ(U7rmdir(nested.c_str(), false), 0);
	CHECK_EQ(U7rmdir((std::string(scratch) + "/a").c_str(), false), 0);

	// Removal.
	U7remove(file.c_str());
	U7remove(copy.c_str());
	CHECK(!U7exists(file));
	CHECK_EQ(U7rmdir(scratch, false), 0);
	CHECK(!U7exists(scratch));
}

TEST(rmdir_recursive_removes_tree) {
	const std::string root = "unit_rmdir_tree";
	U7rmdir(root.c_str(), true);
	CHECK_EQ(U7mkdir((root + "/sub/deeper").c_str(), 0755, true), 0);
	const char* const files[] = {"/a.txt", "/b.txt", "/.hidden", "/sub/c.txt", "/sub/.hidden", "/sub/deeper/d.txt"};
	for (const char* name : files) {
		auto out = U7open_out((root + name).c_str(), true);
		*out << name;
	}
	CHECK_EQ(U7rmdir(root.c_str(), true), 0);
	CHECK(!U7exists(root));
	// Nothing left to remove: report failure.
	CHECK(U7rmdir(root.c_str(), true) != 0);
}

#ifndef _WIN32
TEST(rmdir_recursive_does_not_follow_symlinks) {
	const std::string root    = "unit_rmdir_links";
	const std::string outside = "unit_rmdir_outside";
	U7rmdir(root.c_str(), true);
	U7rmdir(outside.c_str(), true);
	CHECK_EQ(U7mkdir(root.c_str()), 0);
	CHECK_EQ(U7mkdir(outside.c_str()), 0);
	{
		auto out = U7open_out((outside + "/keep.txt").c_str(), true);
		*out << "keep";
	}
	// One link to the directory, one to the file inside it.
	CHECK_EQ(symlink(("../" + outside).c_str(), (root + "/dirlink").c_str()), 0);
	CHECK_EQ(symlink(("../" + outside + "/keep.txt").c_str(), (root + "/filelink").c_str()), 0);
	CHECK_EQ(U7rmdir(root.c_str(), true), 0);
	CHECK(!U7exists(root));
	// The links went, what they pointed to did not.
	CHECK(U7exists(outside + "/keep.txt"));
	U7remove((outside + "/keep.txt").c_str());
	CHECK_EQ(U7rmdir(outside.c_str(), false), 0);
}

TEST(rmdir_recursive_treats_wildcards_literally) {
	// A mod zip picks its own directory name, so "*" or "[o]ther" must name
	// only that directory, never its siblings.
	const std::string root = "unit_rmdir_glob";
	U7rmdir(root.c_str(), true);
	CHECK_EQ(U7mkdir((root + "/other/sub").c_str(), 0755, true), 0);
	const char* const names[] = {"/*", "/[o]ther", "/?ther"};
	for (const char* name : names) {
		CHECK_EQ(U7mkdir((root + name + "/sub").c_str(), 0755, true), 0);
		auto out = U7open_out((root + name + "/sub/x.txt").c_str(), true);
		*out << "x";
	}
	{
		auto out = U7open_out((root + "/other/sub/keep.txt").c_str(), true);
		*out << "keep";
	}
	for (const char* name : names) {
		CHECK_EQ(U7rmdir((root + name).c_str(), true), 0);
		CHECK(!U7exists(root + name));
		CHECK(U7exists(root + "/other/sub/keep.txt"));
	}
	CHECK_EQ(U7rmdir(root.c_str(), true), 0);
}

TEST(rmdir_recursive_removes_symlinked_root_not_target) {
	const std::string link    = "unit_rmdir_root_link";
	const std::string outside = "unit_rmdir_root_target";
	// unlink(), not U7rmdir(): a link left by a failed run must not be followed.
	unlink(link.c_str());
	U7rmdir(outside.c_str(), true);
	CHECK_EQ(U7mkdir(outside.c_str()), 0);
	{
		auto out = U7open_out((outside + "/keep.txt").c_str(), true);
		*out << "keep";
	}
	// The directory being deleted is itself a link to another directory,
	// however the name ends (a mod's cfg may spell the patch path "dir/.").
	for (const std::string& path : {link, link + "/", link + "/.", link + "/./", link + "//./."}) {
		CHECK_EQ(symlink(outside.c_str(), link.c_str()), 0);
		CHECK_EQ(U7rmdir(path.c_str(), true), 0);
		struct stat st;
		CHECK(lstat(link.c_str(), &st) != 0);
		// The link went, what it pointed to did not.
		CHECK(U7exists(outside + "/keep.txt"));
	}
	U7remove((outside + "/keep.txt").c_str());
	CHECK_EQ(U7rmdir(outside.c_str(), false), 0);
}
#endif

TEST(open_missing_file_throws) {
	bool threw = false;
	try {
		U7open_in("unit_no_such_file.bin");
	} catch (const file_open_exception&) {
		threw = true;
	}
	CHECK(threw);
	CHECK(!U7exists("unit_no_such_file.bin"));
	CHECK(U7open_static("unit_no_such_file.bin", false) == nullptr);
}

TEST(stream_data_source_reads) {
	const std::string bytes("\x01\x34\x12\x12\x34\x78\x56\x34\x12hi", 11);
	std::istringstream iss(bytes);
	IStreamDataSource  in(&iss);
	CHECK_EQ(in.getSize(), size_t(11));
	CHECK_EQ(unsigned(in.read1()), 1u);
	CHECK_EQ(unsigned(in.read2()), 0x1234u);
	CHECK_EQ(unsigned(in.read2high()), 0x1234u);
	CHECK_EQ(unsigned(in.read4()), 0x12345678u);
	CHECK(in.good());
	std::string s;
	in.read(s, 2);
	CHECK_EQ(s, std::string("hi"));
	CHECK(in.eof());
	in.clear_error();    // eof() above left the stream in the EOF state
	in.seek(1);
	CHECK_EQ(in.getPos(), size_t(1));
	CHECK_EQ(unsigned(in.peek()), 0x34u);
	in.skip(2);
	CHECK_EQ(in.getPos(), size_t(3));
	auto sub = in.makeSource(2);
	CHECK_EQ(unsigned(sub->read2high()), 0x1234u);
	in.clear_error();
}

TEST(stream_data_source_writes) {
	std::ostringstream oss;
	OStreamDataSource  out(&oss);
	out.write1(0xAB);
	out.write2(0x1234);
	out.write2high(0x1234);
	out.write4(0x01020304u);
	out.write4high(0x01020304u);
	out.write(std::string("ok"));
	out.write("!", 1);
	out.flush();
	CHECK(out.good());
	CHECK_EQ(out.getPos(), size_t(16));
	const std::string expected("\xAB\x34\x12\x12\x34\x04\x03\x02\x01\x01\x02\x03\x04ok!", 16);
	CHECK_EQ(oss.str(), expected);
}

TEST(buffer_view_copy_and_make_source) {
	const unsigned char raw[] = {1, 2, 3, 4, 5, 6};
	IBufferDataView     in(raw, sizeof(raw));
	auto                sub = in.makeSource(4);
	CHECK_EQ(in.getPos(), size_t(4));
	CHECK_EQ(sub->getSize(), size_t(4));
	OBufferDataSource dest(8);
	in.copy_to(dest);
	CHECK_EQ(dest.getPos(), size_t(2));
	// Reading past the end flips the failure state.
	IBufferDataView empty(nullptr, 0);
	CHECK(!empty.good());
	empty.peek();
	CHECK(empty.fail());
}
