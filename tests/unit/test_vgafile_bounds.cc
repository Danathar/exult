// shapes/vgafile.h: a shape number from a file must not index past the table.
#include "databuf.h"
#include "harness.h"
#include "ibuf8.h"
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

// shapes/vgafile.cc: RLE frame data from a file must stay inside its buffer.
// The painters stop only on a zero scanline word, so a frame whose scanlines,
// runs or terminator do not fit has to load as an empty frame instead.
namespace {
	// A one-frame RLE shape: total length, header length 8, the extents
	// (xright 3, all others 0, so 4x1), then the given scanline data.
	std::vector<unsigned char> rle_shape(const std::vector<unsigned char>& scanlines) {
		std::vector<unsigned char> bytes(16, 0);
		bytes.insert(bytes.end(), scanlines.begin(), scanlines.end());
		const auto total = static_cast<uint32_t>(bytes.size());
		bytes[0]         = static_cast<unsigned char>(total & 0xff);
		bytes[1]         = static_cast<unsigned char>(total >> 8);
		bytes[4]         = 8;
		bytes[8]         = 3;
		return bytes;
	}

	bool loads_empty(const std::vector<unsigned char>& scanlines) {
		const auto      bytes = rle_shape(scanlines);
		IBufferDataView source(bytes.data(), bytes.size());
		Shape_file      shape(&source);
		Shape_frame*    frame = shape.get_frame(0);
		return frame != nullptr && frame->is_rle() && frame->is_empty() && frame->get_width() == 1;
	}
}    // namespace

TEST(rle_frame_with_valid_scanlines_still_paints) {
	// Raw scanline of 4 pixels at (0,0), an encoded scanline of 4 pixels
	// at (0,0) (a 2-pixel run of colour 7, then 2 raw pixels), terminator.
	const auto      bytes = rle_shape({8, 0, 0, 0, 0, 0, 1, 2, 3, 4,       // raw
									   9, 0, 0, 0, 0, 0, 5, 7, 4, 8, 9,    // encoded
									   0, 0});
	IBufferDataView source(bytes.data(), bytes.size());
	Shape_file      shape(&source);
	Shape_frame*    frame = shape.get_frame(0);
	CHECK(frame != nullptr);
	if (frame == nullptr) {
		return;
	}
	CHECK(!frame->is_empty());
	CHECK(frame->get_width() == 4);
	Image_buffer8 img(8, 8);
	img.fill8(0);
	frame->paint(&img, 2, 2);
	CHECK(img.get_pixel8(2, 2) == 7);
	CHECK(img.get_pixel8(3, 2) == 7);
	CHECK(img.get_pixel8(4, 2) == 8);
	CHECK(img.get_pixel8(5, 2) == 9);
}

TEST(rle_frame_without_terminator_loads_empty) {
	CHECK(loads_empty({8, 0, 0, 0, 0, 0, 1, 2, 3, 4}));
	CHECK(loads_empty({8, 0, 0, 0, 0, 0, 1, 2, 3, 4, 0}));
}

TEST(rle_frame_with_raw_scanline_past_the_end_loads_empty) {
	// Claims 200 raw pixels, holds 4.
	CHECK(loads_empty({0x90, 0x01, 0, 0, 0, 0, 1, 2, 3, 4, 0, 0}));
	// Scanline word with no room for x and y.
	CHECK(loads_empty({8, 0, 0, 0}));
}

TEST(rle_frame_with_encoded_run_past_the_end_loads_empty) {
	// Encoded scanline of 4 whose runs never add up and run off the data.
	CHECK(loads_empty({9, 0, 0, 0, 0, 0, 0, 0, 0}));
	// A 6-pixel run in a 4-pixel scanline.
	CHECK(loads_empty({9, 0, 0, 0, 0, 0, 13, 7, 0, 0}));
	// Raw run of 3 pixels with only 2 bytes left.
	CHECK(loads_empty({9, 0, 0, 0, 0, 0, 6, 1, 2}));
	// Repeat run with no colour byte.
	CHECK(loads_empty({9, 0, 0, 0, 0, 0, 9}));
}
