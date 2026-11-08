// StringsBase::String::ToArray() in shapes/items.h. It caches an array of
// message strings and rebuilds it when the text is reloaded. A rebuild that
// throws must leave the cache usable, not pointing at freed memory.
#include "harness.h"
#include "items.h"

#include <stdexcept>
#include <string>

namespace {
	int  g_load_counter = 1;
	bool g_throw        = false;
}    // namespace

// Stand-ins for the engine's text tables (shapes/items.cc is not linked here).
int get_text_load_counter() {
	return g_load_counter;
}

const char* get_text_msg(unsigned num) {
	if (g_throw) {
		throw std::runtime_error("text reload failed");
	}
	return num % 2 ? "yes" : "no";
}

namespace {
	using Pair = StringsBase::stringString<0x401, 2>;
	using Trio = StringsBase::stringString<0x401, 3>;
}    // namespace

TEST(items_to_array_reference_stable_until_reload) {
	g_throw = false;
	Pair p;
	const auto& a = p.ToArray();
	const auto& b = p.ToArray();
	CHECK(&a == &b);
	CHECK_EQ(a[0], std::string("yes"));
	CHECK_EQ(a[1], std::string("no"));
}

TEST(items_to_array_survives_failed_reload) {
	g_throw = false;
	Pair p;
	Trio t;
	const auto& pa = p.ToArray();
	const auto& ta = t.ToArray();
	++g_load_counter;
	g_throw = true;
	bool pthrew = false;
	bool tthrew = false;
	try {
		p.ToArray();
	} catch (const std::runtime_error&) {
		pthrew = true;
	}
	try {
		t.ToArray();
	} catch (const std::runtime_error&) {
		tthrew = true;
	}
	CHECK(pthrew);
	CHECK(tthrew);
	// The previously returned arrays are still readable.
	CHECK_EQ(pa[0], std::string("yes"));
	CHECK_EQ(ta[2], std::string("yes"));
	// A later call retries the rebuild and succeeds.
	g_throw = false;
	CHECK_EQ(p.ToArray()[1], std::string("no"));
	CHECK_EQ(t.ToArray()[1], std::string("no"));
}
