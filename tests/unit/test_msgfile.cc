// Text message file parsing (files/msgfile.cc). The engine reads exultmsg.txt,
// the font, shape and usecode text tables and mod text files through
// Text_msg_file_reader, and textpack -c builds Flex archives from it. A file
// that fails to parse must leave the reader empty (callers then fall back to
// built-in text) instead of reading out of bounds or allocating without limit.
#include "databuf.h"
#include "harness.h"
#include "msgfile.h"

#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

namespace {
	struct Parsed {
		std::string          text;
		IBufferDataView      in;
		Text_msg_file_reader reader;

		explicit Parsed(std::string t) : text(std::move(t)), in(text.data(), text.size()), reader(in) {}
	};

	std::string at(const Text_msg_file_reader& r, size_t i) {
		const auto& g = r.get_global_section();
		if (i >= g.size() || !g[i].has_value()) {
			return "<none>";
		}
		return std::string(*g[i]);
	}

	bool is_empty(const Text_msg_file_reader& r) {
		return r.get_global_section().empty() && r.get_sections().empty();
	}
}    // namespace

TEST(msgfile_reads_decimal_hex_and_octal_indexes) {
	Parsed      p("0:zero\n0x10:hex\n010:oct\n3:three\n0X0b:upper\n");
	const auto& g = p.reader.get_global_section();
	CHECK_EQ(g.size(), size_t(17));
	CHECK_EQ(at(p.reader, 0), std::string("zero"));
	CHECK_EQ(at(p.reader, 3), std::string("three"));
	CHECK_EQ(at(p.reader, 11), std::string("upper"));
	CHECK_EQ(at(p.reader, 8), std::string("oct"));
	CHECK_EQ(at(p.reader, 16), std::string("hex"));
	CHECK_EQ(at(p.reader, 1), std::string("<none>"));
}

TEST(msgfile_auto_indexes_lines_without_a_number) {
	Parsed p(":a\n:b\n:c");
	CHECK_EQ(p.reader.get_global_section().size(), size_t(3));
	CHECK_EQ(at(p.reader, 0), std::string("a"));
	CHECK_EQ(at(p.reader, 2), std::string("c"));
}

TEST(msgfile_skips_comments_blank_lines_and_lines_without_colon) {
	Parsed p("# comment\n\n  \t 1:one\nno colon here\r\n2:two: with colon\r\n");
	CHECK_EQ(p.reader.get_global_section().size(), size_t(3));
	CHECK_EQ(at(p.reader, 0), std::string("<none>"));
	CHECK_EQ(at(p.reader, 1), std::string("one"));
	CHECK_EQ(at(p.reader, 2), std::string("two: with colon"));
}

TEST(msgfile_whitespace_only_lines_are_skipped) {
	// A line of only blanks or tabs, between entries and as the unterminated
	// last line, is ignored rather than parsed past its end.
	Parsed p("0:a\n   \t\n1:b\n \t ");
	CHECK_EQ(p.reader.get_global_section().size(), size_t(2));
	CHECK_EQ(at(p.reader, 0), std::string("a"));
	CHECK_EQ(at(p.reader, 1), std::string("b"));
}

TEST(msgfile_whitespace_only_line_inside_section) {
	Parsed p("%%section s\n\t\t\n0:x\n%%endsection\n");
	CHECK(p.reader.has_section("s"));
	std::vector<std::string> strings;
	p.reader.get_section_strings("s", strings);
	CHECK_EQ(strings.size(), size_t(1));
	CHECK_EQ(strings.at(0), std::string("x"));
}

TEST(msgfile_sections_are_kept_apart_from_global_entries) {
	Parsed p("%%section shapes\n0x2:two\n1:one\n%%endsection shapes\n5:global\n");
	CHECK(p.reader.has_section("shapes"));
	CHECK(!p.reader.has_section("other"));
	int         first = 99;
	const auto* sec   = p.reader.get_section("shapes", first);
	CHECK(sec != nullptr);
	CHECK_EQ(first, 1);
	if (sec != nullptr) {
		CHECK_EQ(sec->size(), size_t(3));
		CHECK(!(*sec)[0].has_value());
		CHECK((*sec)[2] == std::optional<std::string_view>("two"));
	}
	CHECK_EQ(p.reader.get_global_section().size(), size_t(6));
	CHECK_EQ(at(p.reader, 5), std::string("global"));

	std::vector<std::string> strings;
	CHECK_EQ(p.reader.get_global_section_strings(strings), 5u);
	CHECK_EQ(strings.size(), size_t(6));
	CHECK_EQ(strings[0], std::string());
	CHECK_EQ(strings[5], std::string("global"));
}

TEST(msgfile_stray_and_nested_section_markers_are_tolerated) {
	// An endsection outside a section, and a section opened inside another,
	// are reported but not fatal: parsing goes on in the global / new section.
	Parsed p("%%endsection\n0:a\n%%section outer\n%%section inner\n0:x\n%%endsection\n1:b\n");
	CHECK_EQ(at(p.reader, 0), std::string("a"));
	CHECK_EQ(at(p.reader, 1), std::string("b"));
	std::vector<std::string> strings;
	p.reader.get_section_strings("inner", strings);
	CHECK(strings == std::vector<std::string>{"x"});
	CHECK(p.reader.has_section("outer"));
	p.reader.get_section_strings("outer", strings);
	CHECK(strings.empty());
}

TEST(msgfile_section_name_is_the_rest_of_the_line) {
	// Everything after the blanks is the name, including a ':'; the header
	// line itself is never read as an entry.
	Parsed p("%%section key:value\n0:x\n%%endsection\n");
	CHECK(p.reader.has_section("key:value"));
	CHECK(p.reader.get_global_section().empty());
}

TEST(msgfile_missing_section_lookups) {
	Parsed p("0:a\n");
	int    first = 99;
	CHECK(p.reader.get_section("none", first) == nullptr);
	CHECK_EQ(first, -1);
	std::vector<std::string> strings{"stale"};
	CHECK_EQ(p.reader.get_section_strings("none", strings), 0u);
	CHECK(strings.empty());
	std::vector<std::optional<std::string>> opt{std::string("stale")};
	CHECK_EQ(p.reader.get_section_strings("none", opt), 0u);
	CHECK(opt.empty());
}

TEST(msgfile_optional_strings_keep_gaps) {
	Parsed                                  p("%%section s\n0:a\n2:c\n%%endsection\n");
	std::vector<std::optional<std::string>> opt;
	CHECK_EQ(p.reader.get_section_strings("s", opt), 0u);
	CHECK_EQ(opt.size(), size_t(3));
	CHECK(opt[0] == std::optional<std::string>("a"));
	CHECK(!opt[1].has_value());
	CHECK(opt[2] == std::optional<std::string>("c"));
}

TEST(msgfile_first_index_is_the_lowest_given) {
	Parsed                   p("7:a\n3:b\n9:c\n");
	std::vector<std::string> strings;
	CHECK_EQ(p.reader.get_global_section_strings(strings), 3u);
}

TEST(msgfile_bare_section_header_fails_cleanly) {
	// "%%section" with no name, with or without trailing blanks, is an error:
	// the whole file is rejected and nothing is kept.
	for (const char* text : {"0:a\n%%section\n1:b\n", "0:a\n%%section \t \n1:b\n", "0:a\n%%section"}) {
		Parsed p(text);
		CHECK(is_empty(p.reader));
	}
}

TEST(msgfile_duplicate_section_fails) {
	Parsed p("%%section s\n0:a\n%%endsection\n%%section s\n0:b\n%%endsection\n");
	CHECK(is_empty(p.reader));
}

TEST(msgfile_index_limit_is_0xffff) {
	{
		Parsed p("0xffff:last\n");
		CHECK_EQ(p.reader.get_global_section().size(), size_t(0x10000));
		CHECK_EQ(at(p.reader, 0xffff), std::string("last"));
	}
	{
		// One past the limit, in hex and decimal, rejects the file instead of
		// resizing the section to the index.
		Parsed p("0:a\n0x10000:big\n");
		CHECK(is_empty(p.reader));
	}
	{
		Parsed p("65536:big\n");
		CHECK(is_empty(p.reader));
	}
	{
		Parsed p("0xffffffff:huge\n");
		CHECK(is_empty(p.reader));
	}
	{
		Parsed p("%%section s\n0x10000:big\n%%endsection\n");
		CHECK(is_empty(p.reader));
	}
}

TEST(msgfile_bad_numbers_fail) {
	// A bad index on any line rejects the whole file, entries before it too.
	for (const char* bad : {"zz:b\n", "08:b\n", "12x:b\n", "-1:b\n", "0x:b\n", "99999999999:b\n"}) {
		Parsed p(std::string("0:a\n") + bad + "1:c\n");
		CHECK(is_empty(p.reader));
	}
}

TEST(msgfile_version_section) {
	{
		Parsed p("%%section version\n:3\n%%endsection\n0:a\n");
		CHECK(p.reader.get_version() == std::optional<int>(3));
	}
	{
		Parsed p("0:a\n");
		CHECK(!p.reader.get_version().has_value());
	}
	{
		Parsed p("");
		CHECK(!p.reader.get_version().has_value());
	}
	{
		Parsed p("%%section version\n:3\n:4\n%%endsection\n");
		CHECK(!p.reader.get_version().has_value());
	}
	{
		Parsed p("%%section version\n:three\n%%endsection\n");
		CHECK(!p.reader.get_version().has_value());
	}
}

TEST(msgfile_translator_hook_sees_raw_contents) {
	set_text_msg_translator([](std::string& text, bool special) {
		text = special ? "0:special\n" : "0:plain\n";
	});
	{
		std::string          raw("0:untouched\n");
		IBufferDataView      in(raw.data(), raw.size());
		Text_msg_file_reader r(in, true);
		CHECK_EQ(at(r, 0), std::string("special"));
	}
	{
		std::string          raw("0:untouched\n");
		IBufferDataView      in(raw.data(), raw.size());
		Text_msg_file_reader r(in);
		CHECK_EQ(at(r, 0), std::string("plain"));
	}
	set_text_msg_translator(nullptr);
	Parsed p("0:untouched\n");
	CHECK_EQ(at(p.reader, 0), std::string("untouched"));
}

TEST(msgfile_write_section_round_trips) {
	std::vector<std::string> items{"a", "", "c", "", "", "", "", "", "", "", "", "k"};
	std::ostringstream       out;
	Write_msg_file_section(out, "names", items);
	// The hex flag set for the indexes must not leak to the caller's stream.
	out << 10;
	CHECK_EQ(out.str(), std::string("%%section names\n0x0:a\n0x2:c\n0xb:k\n%%endsection names\n10"));

	Parsed                   p(out.str().substr(0, out.str().size() - 2));
	std::vector<std::string> back;
	p.reader.get_section_strings("names", back);
	CHECK(back == items);
}
