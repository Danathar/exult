// shapes/vgafile.h: a shape number from a file must not index past the table.
#include "harness.h"
#include "vgafile.h"

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <vector>

namespace {
	constexpr const char* shape_file_name = "test_vgafile_bounds.vga";
	constexpr uint32_t    shape_count     = 4;

	// A flex file holding shape_count entries: one 8x8 tile, then empty ones.
	void write_shape_file() {
		constexpr uint32_t table_end = 0x80 + shape_count * 8;
		constexpr uint32_t tile_size = 64;
		std::vector<char>  bytes(table_end + tile_size, 0);
		bytes[0x50] = 0x00;    // Flex magic, little-endian 0xffff1a00.
		bytes[0x51] = 0x1a;
		bytes[0x52] = static_cast<char>(0xff);
		bytes[0x53] = static_cast<char>(0xff);
		bytes[0x54] = static_cast<char>(shape_count);
		bytes[0x80] = static_cast<char>(table_end);    // Entry 0's offset,
		bytes[0x84] = static_cast<char>(tile_size);    // and its length.
		std::ofstream out(shape_file_name, std::ios::binary);
		out.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
	}
}    // namespace

TEST(vga_get_shape_refuses_numbers_outside_the_table) {
	write_shape_file();
	Vga_file file(shape_file_name);
	CHECK(file.get_num_shapes() == static_cast<int>(shape_count));
	CHECK(file.get_shape(shape_count, 16) == nullptr);
	CHECK(file.get_shape(32767, 16) == nullptr);
	CHECK(file.get_shape(-1, 16) == nullptr);
	std::remove(shape_file_name);
}

TEST(vga_get_num_frames_is_zero_outside_the_table) {
	write_shape_file();
	Vga_file file(shape_file_name);
	CHECK(file.get_num_frames(shape_count) == 0);
	CHECK(file.get_num_frames(32767) == 0);
	CHECK(file.get_num_frames(-1) == 0);
	std::remove(shape_file_name);
}

TEST(vga_get_shape_still_answers_inside_the_table) {
	write_shape_file();
	Vga_file file(shape_file_name);
	CHECK(file.get_shape(0, 0) != nullptr);
	CHECK(file.get_num_frames(0) == 1);
	// The entry is empty, so there is no frame, but the lookup is valid.
	CHECK(file.get_shape(shape_count - 1, 0) == nullptr);
	CHECK(file.get_num_frames(shape_count - 1) == 0);
	std::remove(shape_file_name);
}
