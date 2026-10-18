// Endian helpers (files/endianio.h), buffer data sources (files/databuf.h),
// SHA-1 and the CRC-32 file checksum.
#include "harness.h"
#include "crc.h"
#include "databuf.h"
#include "endianio.h"
#include "sha1.h"
#include "utils.h"

#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>

TEST(endianio_roundtrip) {
	unsigned char buf[8] = {};
	unsigned char* p     = buf;
	little_endian::Write2(p, 0x1234);
	little_endian::Write4(p, 0xAABBCCDDu);
	CHECK_EQ(int(buf[0]), 0x34);
	CHECK_EQ(int(buf[1]), 0x12);
	CHECK_EQ(int(buf[2]), 0xDD);
	CHECK_EQ(int(buf[5]), 0xAA);
	const unsigned char* r = buf;
	CHECK_EQ(unsigned(little_endian::Read2(r)), 0x1234u);
	CHECK_EQ(unsigned(little_endian::Read4(r)), 0xAABBCCDDu);

	unsigned char big[4] = {};
	p                    = big;
	big_endian::Write4(p, 0x01020304u);
	CHECK_EQ(int(big[0]), 1);
	CHECK_EQ(int(big[3]), 4);
	r = big;
	CHECK_EQ(unsigned(big_endian::Read4(r)), 0x01020304u);
}

TEST(buffer_data_source_reads) {
	const unsigned char raw[] = {0x01, 0x34, 0x12, 0x12, 0x34, 0x78, 0x56, 0x34, 0x12, 'h', 'i'};
	IBufferDataView     in(raw, sizeof(raw));
	CHECK_EQ(in.getSize(), sizeof(raw));
	CHECK_EQ(unsigned(in.read1()), 1u);
	CHECK_EQ(unsigned(in.read2()), 0x1234u);
	CHECK_EQ(unsigned(in.read2high()), 0x1234u);
	CHECK_EQ(unsigned(in.read4()), 0x12345678u);
	std::string s;
	in.read(s, 2);
	CHECK_EQ(s, std::string("hi"));
	CHECK_EQ(in.getAvail(), size_t(0));
	in.seek(1);
	CHECK_EQ(in.getPos(), size_t(1));
	CHECK_EQ(unsigned(in.peek()), 0x34u);
	in.skip(2);
	CHECK_EQ(in.getPos(), size_t(3));
}

TEST(buffer_data_source_write_then_read) {
	OBufferDataSource out(16);
	out.write1(0xAB);
	out.write2(0xBEEF);
	out.write4high(0x01020304u);
	out.write(std::string("xyz"));
	CHECK_EQ(out.getPos(), size_t(10));
	unsigned char copy[16];
	std::memcpy(copy, out.getPtr() - out.getPos(), out.getPos());
	IBufferDataView in(copy, out.getPos());
	CHECK_EQ(unsigned(in.read1()), 0xABu);
	CHECK_EQ(unsigned(in.read2()), 0xBEEFu);
	CHECK_EQ(unsigned(in.read4high()), 0x01020304u);
	std::string s;
	in.read(s, 3);
	CHECK_EQ(s, std::string("xyz"));
}

TEST(readline_handles_cr_lf) {
	const char     text[] = "one\r\ntwo\nthree";
	IBufferDataView in(text, sizeof(text) - 1);
	std::string    line;
	in.readline(line);
	CHECK_EQ(line, std::string("one"));
	in.readline(line);
	CHECK_EQ(line, std::string("two"));
	in.readline(line);
	CHECK_EQ(line, std::string("three"));
}

TEST(sha1_known_vectors) {
	auto hex = [](const char* s) {
		const auto h = sha1::toHexString(sha1::calc(s, int(std::strlen(s))));
		return std::string(h.data());
	};
	CHECK_EQ(hex(""), std::string("da39a3ee5e6b4b0d3255bfef95601890afd80709"));
	CHECK_EQ(hex("abc"), std::string("a9993e364706816aba3e25717850c26c9cd0d89d"));
	CHECK_EQ(hex("The quick brown fox jumps over the lazy dog"), std::string("2fd4e1c67a2d28fced849ee1bb76e7391b93eb12"));
}

TEST(crc32_of_file) {
	const std::string path = "unit_crc_test.tmp";
	{
		std::ofstream f(path, std::ios::binary);
		f << "123456789";
	}
	// Exult's crc32() uses the reflected 0xEDB88320 polynomial but, unlike
	// zlib's CRC-32, starts from 0 and applies no final inversion. Check it
	// against an independent bitwise implementation of that variant, and pin
	// the value so an accidental change to the algorithm is caught.
	uint32_t ref = 0;
	for (const char ch : std::string("123456789")) {
		ref ^= static_cast<unsigned char>(ch);
		for (int bit = 0; bit < 8; ++bit) {
			ref = (ref & 1) ? (ref >> 1) ^ 0xEDB88320u : ref >> 1;
		}
	}
	CHECK_EQ(crc32(path.c_str()), ref);
	CHECK_EQ(crc32(path.c_str()), 0x2DFD2D88u);
	std::remove(path.c_str());
	CHECK_EQ(crc32("definitely/not/here.bin", true), 0u);
}
