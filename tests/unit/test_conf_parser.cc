// Configuration / XMLnode parsing (conf/Configuration.cc, conf/XMLEntity.cc).
// Malformed input must make read_config_string / read_abs_config_file return
// false (so callers fall back to defaults) instead of asserting or reading past
// the end of the string, and a config file is read in full even when its last
// line has no trailing newline. Temporary files are written to the CWD
// (run-unit-tests.sh runs from the build directory).
#include "harness.h"
#include "conf/Configuration.h"

#include <cstdio>
#include <fstream>
#include <string>

namespace {
	std::string value_of(const Configuration& c, const char* key) {
		std::string ret;
		c.value(key, ret, "dflt");
		return ret;
	}

	void write_file(const char* name, const std::string& data) {
		std::ofstream out(name, std::ios::binary);
		out << data;
	}
}    // namespace

TEST(conf_parses_well_formed_string) {
	Configuration c;
	CHECK(c.read_config_string("<config>\n<a>1</a>\n<b>x &amp; y &lt;z&gt;</b>\n</config>\n"));
	CHECK_EQ(value_of(c, "config/a"), std::string("1"));
	CHECK_EQ(value_of(c, "config/b"), std::string("x & y <z>"));
	CHECK_EQ(value_of(c, "config/missing"), std::string("dflt"));
}

TEST(conf_keeps_comments_and_empty_tags) {
	Configuration c;
	CHECK(c.read_config_string("<config><!-- a note --><e/><a>1</a></config>"));
	CHECK_EQ(value_of(c, "config/a"), std::string("1"));
}

TEST(conf_rejects_non_xml) {
	Configuration c;
	CHECK(!c.read_config_string("hello not xml\n"));
	CHECK(!c.read_config_string("   \n\t"));
	CHECK(!c.read_config_string(""));
	CHECK(!c.key_exists("config/hello"));
}

TEST(conf_bare_ampersand_is_literal) {
	Configuration c;
	CHECK(c.read_config_string("<config>\n<a>x &\n"));
	CHECK_EQ(value_of(c, "config/a"), std::string("x &"));

	Configuration d;
	CHECK(d.read_config_string("<config><a>fish & chips</a></config>"));
	CHECK_EQ(value_of(d, "config/a"), std::string("fish & chips"));
}

TEST(conf_rejects_unterminated_close_tag) {
	Configuration c;
	CHECK(!c.read_config_string("<config><a>1</a></config\n"));
	// The partial tree is dropped.
	CHECK(!c.key_exists("config/a"));

	Configuration d;
	CHECK(!d.read_config_string("<config><a>1</a"));
	CHECK(!d.key_exists("config/a"));
}

TEST(conf_dump_with_empty_tag_name) {
	Configuration c;
	c.read_config_string("<>");
	// Must not index before the start of the empty tag name.
	const std::string out = c.dump();
	CHECK(!out.empty());
}

TEST(conf_roundtrip_after_set) {
	Configuration c;
	CHECK(c.read_config_string("<config><a>1</a></config>"));
	c.set("config/b", "a & <b>", false);
	Configuration d;
	CHECK(d.read_config_string(c.dump()));
	CHECK_EQ(value_of(d, "config/a"), std::string("1"));
	CHECK_EQ(value_of(d, "config/b"), std::string("a & <b>"));
}

TEST(conf_file_without_trailing_newline) {
	const char* const nonl = "./unit_conf_nonl.cfg";
	const char* const ok   = "./unit_conf_ok.cfg";
	write_file(nonl, "<config><a>1</a></config>");
	write_file(ok, "<config>\n<a>1</a>\n</config>\n");

	Configuration c1;
	CHECK(c1.read_abs_config_file(nonl));
	CHECK_EQ(value_of(c1, "config/a"), std::string("1"));

	Configuration c2;
	CHECK(c2.read_abs_config_file(ok));
	CHECK_EQ(value_of(c2, "config/a"), std::string("1"));

	// Multi-line file whose last line carries a value.
	write_file(nonl, "<config>\n<a>1</a>\n<b>2</b></config>");
	Configuration c3;
	CHECK(c3.read_abs_config_file(nonl));
	CHECK_EQ(value_of(c3, "config/a"), std::string("1"));
	CHECK_EQ(value_of(c3, "config/b"), std::string("2"));

	std::remove(nonl);
	std::remove(ok);
}

TEST(conf_file_empty_or_malformed_returns_false) {
	const char* const name = "./unit_conf_bad.cfg";
	write_file(name, "");
	Configuration c1;
	CHECK(!c1.read_abs_config_file(name));

	write_file(name, "not xml at all");
	Configuration c2;
	CHECK(!c2.read_abs_config_file(name));
	CHECK_EQ(value_of(c2, "config/a"), std::string("dflt"));

	write_file(name, "<config><a>1</a></config");
	Configuration c3;
	CHECK(!c3.read_abs_config_file(name));
	CHECK_EQ(value_of(c3, "config/a"), std::string("dflt"));

	std::remove(name);
}
