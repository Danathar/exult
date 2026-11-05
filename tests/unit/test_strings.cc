// istring.cc, hash_utils.h and the string helpers in files/utils.cc.
#include "harness.h"
#include "hash_utils.h"
#include "istring.h"
#include "utils.h"

#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <string>

TEST(strcasecmp_ignores_case) {
	CHECK_EQ(Pentagram::strcasecmp("Exult", "eXULT"), 0);
	CHECK(Pentagram::strcasecmp("abc", "abd") < 0);
	CHECK(Pentagram::strcasecmp("abd", "ABC") > 0);
	CHECK(Pentagram::strcasecmp("ab", "abc") < 0);
	CHECK_EQ(Pentagram::strcasecmp("", ""), 0);
}

TEST(strncasecmp_limits_length) {
	CHECK_EQ(Pentagram::strncasecmp("HelloWorld", "helloMARS", 5), 0);
	CHECK(Pentagram::strncasecmp("HelloWorld", "helloMARS", 6) != 0);
	CHECK_EQ(Pentagram::strncasecmp("abc", "xyz", 0), 0);
}

TEST(tolower_string_and_cstr) {
	std::string s = "MiXed 123 Case";
	Pentagram::tolower(s);
	CHECK_EQ(s, std::string("mixed 123 case"));
	char buf[] = "ABC-def";
	Pentagram::tolower(buf);
	CHECK_EQ(std::string(buf), std::string("abc-def"));
}

TEST(to_uppercase_copy_and_inplace) {
	CHECK_EQ(to_uppercase(std::string("static/u7chunks")), std::string("STATIC/U7CHUNKS"));
	std::string s = "abc";
	to_uppercase(s);
	CHECK_EQ(s, std::string("ABC"));
}

TEST(hashstr_known_values) {
	const hashstr h;
	CHECK_EQ(h(""), 0u);
	CHECK_EQ(h("a"), 97u);
	CHECK_EQ(h("ab"), 97u * 256u + 98u);
	CHECK_EQ(h("abc"), (97u * 65536u + 98u * 256u + 99u));
	CHECK(h("abc") != h("abd"));
}

TEST(eqstr_compares_contents) {
	const eqstr eq;
	const char  a[] = "same";
	const char  b[] = "same";
	CHECK(eq(a, b));
	CHECK(!eq("same", "Same"));
}

TEST(newstrdup_copies_and_rejects_null) {
	char* copy = newstrdup("hello");
	CHECK_EQ(std::string(copy), std::string("hello"));
	delete[] copy;
	bool threw = false;
	try {
		newstrdup(nullptr);
	} catch (const std::invalid_argument&) {
		threw = true;
	}
	CHECK(threw);
}

TEST(quote_posix_shell_arg_wraps_and_escapes_single_quotes) {
	CHECK_EQ(quote_posix_shell_arg(""), std::string("''"));
	CHECK_EQ(quote_posix_shell_arg("Keyring"), std::string("'Keyring'"));
	CHECK_EQ(quote_posix_shell_arg("a b;c$(d)`e`"), std::string("'a b;c$(d)`e`'"));
	CHECK_EQ(quote_posix_shell_arg("it's"), std::string("'it'\\''s'"));
}

#ifndef _WIN32
// A hostile mod title must reach the program as plain text, not run.
TEST(quote_posix_shell_arg_survives_a_real_shell) {
	const std::string hostile = "x;touch quote-test-pwned;$(touch quote-test-pwned)'`touch quote-test-pwned`\"&";
	const std::string out     = "quote-test-out.txt";
	const std::string pwned   = "quote-test-pwned";
	std::remove(pwned.c_str());
	const std::string cmd = "printf %s " + quote_posix_shell_arg(hostile) + " > " + out;
	CHECK_EQ(std::system(cmd.c_str()), 0);
	std::ifstream     in(out, std::ios::binary);
	const std::string got((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
	CHECK_EQ(got, hostile);
	CHECK(!std::ifstream(pwned).good());
	std::remove(out.c_str());
}
#endif

TEST(quote_windows_arg_wraps_and_escapes) {
	CHECK_EQ(quote_windows_arg(""), std::string("\"\""));
	CHECK_EQ(quote_windows_arg("two words"), std::string("\"two words\""));
	CHECK_EQ(quote_windows_arg("a\"b"), std::string("\"a\\\"b\""));
	CHECK_EQ(quote_windows_arg("C:\\dir\\file"), std::string("\"C:\\dir\\file\""));
	CHECK_EQ(quote_windows_arg("a\\\"b"), std::string("\"a\\\\\\\"b\""));
	CHECK_EQ(quote_windows_arg("dir\\"), std::string("\"dir\\\\\""));
}
