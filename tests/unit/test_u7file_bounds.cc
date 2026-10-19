// U7file::retrieve() (files/U7file.h) is shared by the Flex, IFF, Table and
// Flat readers. It must not trust an archive's entry table: an entry whose
// offset or size points past the end of the data source returns nothing
// instead of allocating and reading the claimed size.
#include "U7file.h"
#include "harness.h"

#include <cstring>
#include <memory>
#include <utility>
#include <vector>

namespace {
	// Minimal archive whose entry table is given by the test.
	class TestArchive final : public U7file {
		std::vector<Reference> refs;

	protected:
		Reference get_object_reference(uint32 objnum) const override {
			return refs[objnum];
		}

	public:
		TestArchive(const unsigned char* buf, size_t len, const std::vector<std::pair<size_t, size_t>>& entries)
				: U7file(File_spec("test_archive")) {
			for (const auto& entry : entries) {
				refs.push_back(Reference{entry.first, entry.second});
			}
			data = std::make_unique<IBufferDataView>(buf, len);
		}

		size_t number_of_objects() override {
			return refs.size();
		}

		const char* get_archive_type() override {
			return "TEST";
		}
	};
}    // namespace

TEST(u7file_retrieve_valid_entries) {
	const unsigned char raw[8] = {'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'};
	TestArchive         arc(raw, sizeof(raw), {{2, 3}, {0, 8}, {8, 0}});
	size_t              len = 99;
	auto                buf = arc.retrieve(0, len);
	CHECK(buf != nullptr);
	CHECK_EQ(len, size_t(3));
	CHECK(buf && std::memcmp(buf.get(), "cde", 3) == 0);
	buf = arc.retrieve(1, len);
	CHECK(buf != nullptr);
	CHECK_EQ(len, size_t(8));
	// An empty entry at the very end is still in bounds.
	buf = arc.retrieve(2, len);
	CHECK_EQ(len, size_t(0));
}

TEST(u7file_retrieve_rejects_oversized_entry) {
	const unsigned char raw[8] = {};
	TestArchive         arc(raw, sizeof(raw), {{4, 0xFFFFFFF0u}, {0, 9}, {4, 5}});
	for (uint32 i = 0; i < 3; i++) {
		size_t len = 99;
		auto   buf = arc.retrieve(i, len);
		CHECK(buf == nullptr);
		CHECK_EQ(len, size_t(0));
	}
}

TEST(u7file_retrieve_rejects_offset_past_end) {
	const unsigned char raw[8] = {};
	// The second entry's offset + size would wrap around if added naively.
	TestArchive arc(raw, sizeof(raw), {{9, 0}, {~size_t(0) - 1, 4}});
	for (uint32 i = 0; i < 2; i++) {
		size_t len = 99;
		auto   buf = arc.retrieve(i, len);
		CHECK(buf == nullptr);
		CHECK_EQ(len, size_t(0));
	}
	// Out-of-range object numbers are still rejected as before.
	size_t len = 99;
	CHECK(arc.retrieve(2, len) == nullptr);
	CHECK_EQ(len, size_t(0));
}
