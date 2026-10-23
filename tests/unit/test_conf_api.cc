// Configuration read/write API (conf/Configuration.cc, conf/XMLEntity.cc):
// typed reads with defaults, set/remove on the tree, key listings, the
// entities the parser decodes, and writing a file-backed config back to disk.
// test_conf_parser.cc covers malformed input; this file covers what callers do
// with a config once it has been read. Temporary files are written to the CWD
// (run-unit-tests.sh runs from the build directory).
#include "harness.h"
#include "conf/Configuration.h"

#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace {
	std::string read_file(const char* name) {
		std::ifstream      in(name, std::ios::binary);
		std::ostringstream out;
		out << in.rdbuf();
		return out.str();
	}

	std::string str_value(const Configuration& c, const char* key) {
		std::string ret;
		c.value(key, ret, "dflt");
		return ret;
	}
}    // namespace

TEST(conf_bool_value_is_yes_case_insensitive) {
	Configuration c;
	CHECK(c.read_config_string("<config><a>yes</a><b>YeS</b><c>no</c><d>true</d><e>1</e></config>"));
	bool v = false;
	c.value("config/a", v, false);
	CHECK(v);
	v = false;
	c.value("config/b", v, false);
	CHECK(v);
	v = true;
	c.value("config/c", v, true);
	CHECK(!v);
	// Only "yes" counts: other truthy spellings read as false.
	v = true;
	c.value("config/d", v, true);
	CHECK(!v);
	v = true;
	c.value("config/e", v, true);
	CHECK(!v);
	// A missing key gives the default, either way.
	v = false;
	c.value("config/missing", v, true);
	CHECK(v);
	v = true;
	c.value(std::string("config/missing"), v, false);
	CHECK(!v);
}

TEST(conf_int_value_and_default) {
	Configuration c;
	CHECK(c.read_config_string("<config><n>42</n><neg>-7</neg><bad>x</bad></config>"));
	int v = 0;
	c.value("config/n", v, 5);
	CHECK_EQ(v, 42);
	c.value("config/neg", v, 5);
	CHECK_EQ(v, -7);
	// atoi: text that is not a number reads as 0, not as the default.
	c.value("config/bad", v, 5);
	CHECK_EQ(v, 0);
	c.value(std::string("config/missing"), v, 5);
	CHECK_EQ(v, 5);
}

TEST(conf_string_value_default_overloads) {
	Configuration c;
	std::string   v = "unchanged";
	c.value("config/missing", v);
	CHECK_EQ(v, std::string(""));
	c.value(std::string("config/missing"), v, "d1");
	CHECK_EQ(v, std::string("d1"));
	c.value(std::string("config/missing"), v, std::string("d2"));
	CHECK_EQ(v, std::string("d2"));
}

TEST(conf_set_overloads_create_nested_keys) {
	Configuration c;
	c.set("config/a/b/c", "deep", false);
	c.set(std::string("config/s"), std::string("str"), false);
	c.set("config/cs", std::string("cstr"), false);
	c.set("config/i", 12, false);
	c.set(std::string("config/si"), -3, false);
	CHECK_EQ(str_value(c, "config/a/b/c"), std::string("deep"));
	CHECK(c.key_exists("config/a/b"));
	CHECK_EQ(str_value(c, "config/s"), std::string("str"));
	CHECK_EQ(str_value(c, "config/cs"), std::string("cstr"));
	int v = 0;
	c.value("config/i", v, 0);
	CHECK_EQ(v, 12);
	c.value("config/si", v, 0);
	CHECK_EQ(v, -3);

	// Setting an existing key replaces its value instead of adding a node.
	c.set("config/s", "again", false);
	CHECK_EQ(str_value(c, "config/s"), std::string("again"));
	CHECK_EQ(c.listkeys("config", false).size(), size_t{5});
}

TEST(conf_set_outside_root_is_ignored) {
	Configuration c;
	c.set("other", "x", false);
	CHECK(!c.key_exists("other"));
	CHECK_EQ(str_value(c, "config"), std::string(""));
}

TEST(conf_remove_drops_emptied_nodes) {
	Configuration c;
	CHECK(c.read_config_string("<config><a>1</a><b><c>2</c></b><d>3</d></config>"));
	c.remove("config/a", false);
	CHECK(!c.key_exists("config/a"));
	CHECK(c.key_exists("config/d"));

	// Removing the last child empties its parent, which is dropped too.
	c.remove("config/b/c", false);
	CHECK(!c.key_exists("config/b/c"));
	CHECK(!c.key_exists("config/b"));

	// A key that is not there leaves the tree alone.
	c.remove("config/nope", false);
	c.remove("config/d/nope", false);
	CHECK_EQ(str_value(c, "config/d"), std::string("3"));
}

TEST(conf_remove_keeps_node_with_children) {
	Configuration c;
	CHECK(c.read_config_string("<config><a>1<b>2</b></a></config>"));
	// valueonly removal of a node's own value keeps its children.
	c.remove("config/a", false);
	CHECK(c.key_exists("config/a/b"));
	CHECK_EQ(str_value(c, "config/a"), std::string(""));
	CHECK_EQ(str_value(c, "config/a/b"), std::string("2"));
}

TEST(conf_listkeys_short_and_long) {
	Configuration c;
	CHECK(c.read_config_string("<config><x><a>1</a><b>2</b></x></config>"));
	const std::vector<std::string> longk = c.listkeys("config/x");
	CHECK_EQ(longk.size(), size_t{2});
	CHECK_EQ(longk.at(0), std::string("config/x/a"));
	CHECK_EQ(longk.at(1), std::string("config/x/b"));
	const std::vector<std::string> shortk = c.listkeys(std::string("config/x"), false);
	CHECK_EQ(shortk.size(), size_t{2});
	CHECK_EQ(shortk.at(0), std::string("a"));
	CHECK_EQ(shortk.at(1), std::string("b"));
	CHECK(c.listkeys("config/missing").empty());
}

TEST(conf_getsubkeys_skips_comments) {
	Configuration c;
	CHECK(c.read_config_string("<config><x><!-- note --><a>1</a><b><c>2</c></b></x><y>3</y></config>"));
	Configuration::KeyTypeList ktl;
	c.getsubkeys(ktl, "config/x");
	CHECK_EQ(ktl.size(), size_t{3});
	CHECK(ktl.at(0) == Configuration::KeyType("a", "1"));
	CHECK(ktl.at(1) == Configuration::KeyType("b", ""));
	CHECK(ktl.at(2) == Configuration::KeyType("b/c", "2"));

	Configuration::KeyTypeList none;
	c.getsubkeys(none, "config/missing");
	CHECK(none.empty());
}

TEST(conf_decodes_all_named_entities) {
	Configuration c;
	CHECK(c.read_config_string("<config><a>&apos;&quot;&lt;&gt;&amp;</a><b>&unknown; &copy;</b></config>"));
	CHECK_EQ(str_value(c, "config/a"), std::string("'\"<>&"));
	// An entity name the parser does not know is kept as written.
	CHECK_EQ(str_value(c, "config/b"), std::string("&unknown; &copy;"));

	// dump() writes every one of them back as an entity.
	const std::string out = c.dump();
	CHECK(out.find("<a>&apos;&quot;&lt;&gt;&amp;</a>") != std::string::npos);
}

TEST(conf_tag_attributes_and_self_closing_tags) {
	Configuration c;
	CHECK(c.read_config_string("<config><a k=\"v\">1</a><e/></config>"));
	// The id keeps the attributes; the close tag written out drops them.
	CHECK(c.key_exists("config/a k=\"v\""));
	const std::string out = c.dump();
	CHECK(out.find("<a k=\"v\">1</a>") != std::string::npos);
	CHECK(out.find("<e/>") != std::string::npos);
	CHECK(out.find("</e/>") == std::string::npos);
}

TEST(conf_stream_dump_layout) {
	Configuration c;
	CHECK(c.read_config_string("<config><a>x &amp; y</a><b><c>1</c></b></config>"));
	std::ostringstream o;
	c.dump(o, "\t");
	CHECK_EQ(
			o.str(), std::string("<config>\n"
								 "\t<a> x &amp; y </a>\n"
								 "\t<b>\n"
								 "\t\t<c> 1 </c>\n"
								 "\t</b>\n"
								 "</config>\n"));
}

TEST(conf_write_back_only_for_file_configs) {
	const char* const name = "./unit_conf_wb.cfg";
	std::remove(name);

	// A config read from a string is never written out.
	Configuration s;
	CHECK(s.read_config_string("<config><a>1</a></config>"));
	s.set("config/a", "2", true);
	std::ifstream none(name);
	CHECK(!none.good());

	{
		std::ofstream out(name, std::ios::binary);
		out << "<config>\n<a>1</a>\n</config>\n";
	}
	Configuration f;
	CHECK(f.read_abs_config_file(name));
	f.set("config/b", "x & y", true);
	Configuration g;
	CHECK(g.read_abs_config_file(name));
	CHECK_EQ(str_value(g, "config/a"), std::string("1"));
	CHECK_EQ(str_value(g, "config/b"), std::string("x & y"));

	f.remove("config/a", true);
	Configuration h;
	CHECK(h.read_abs_config_file(name));
	CHECK(!h.key_exists("config/a"));
	CHECK_EQ(str_value(h, "config/b"), std::string("x & y"));
	CHECK(read_file(name).find("&amp;") != std::string::npos);

	// Re-reading from a string detaches the config from its file.
	CHECK(f.read_config_string("<config><z>9</z></config>"));
	f.set("config/z", "10", true);
	Configuration k;
	CHECK(k.read_abs_config_file(name));
	CHECK(!k.key_exists("config/z"));
	CHECK_EQ(str_value(k, "config/b"), std::string("x & y"));

	std::remove(name);
}

TEST(conf_read_config_file_relative_and_root) {
	const char* const name = "./unit_conf_root.cfg";
	{
		std::ofstream out(name, std::ios::binary);
		out << "<game><a>1</a></game>\n";
	}
	Configuration c;
	CHECK(c.read_config_file(name, "game"));
	int v = 0;
	c.value("game/a", v, 0);
	CHECK_EQ(v, 1);
	// clear() keeps the root name given last.
	c.clear();
	CHECK(c.key_exists("game"));
	CHECK(!c.key_exists("config"));
	c.set("game/b", 2, false);
	c.value("game/b", v, 0);
	CHECK_EQ(v, 2);
	std::remove(name);

	Configuration missing;
	CHECK(!missing.read_config_file("./unit_conf_does_not_exist.cfg"));
}
