// Tiny assert-based unit test harness (no third-party framework).
// Tests register themselves with TEST(name) { ... } and are run by main().
#ifndef EXULT_TESTS_HARNESS_H
#define EXULT_TESTS_HARNESS_H

#include <functional>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

namespace harness {
	struct Case {
		std::string           name;
		std::function<void()> fn;
	};

	inline std::vector<Case>& cases() {
		static std::vector<Case> all;
		return all;
	}

	inline int& failures() {
		static int count = 0;
		return count;
	}

	struct Registrar {
		Registrar(const char* name, std::function<void()> fn) {
			cases().push_back({name, std::move(fn)});
		}
	};
}    // namespace harness

#define TEST(name)                                                    \
	static void               test_##name();                          \
	static harness::Registrar registrar_##name(#name, test_##name);   \
	static void               test_##name()

// Non-fatal check: records the failure and continues.
#define CHECK(cond)                                                                   \
	do {                                                                              \
		if (!(cond)) {                                                                \
			std::cerr << __FILE__ << ':' << __LINE__ << ": CHECK failed: " #cond "\n"; \
			++harness::failures();                                                    \
		}                                                                             \
	} while (0)

#define CHECK_EQ(a, b)                                                                                        \
	do {                                                                                                      \
		const auto va_ = (a);                                                                                 \
		const auto vb_ = (b);                                                                                 \
		if (!(va_ == vb_)) {                                                                                  \
			std::cerr << __FILE__ << ':' << __LINE__ << ": CHECK_EQ failed: " #a " == " #b " (" << va_ \
					  << " vs " << vb_ << ")\n";                                                          \
			++harness::failures();                                                                        \
		}                                                                                                 \
	} while (0)

#endif
