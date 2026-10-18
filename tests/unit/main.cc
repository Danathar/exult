// Runs every registered test; exit status is non-zero if any CHECK failed.
#include "harness.h"

int main() {
	for (const auto& test : harness::cases()) {
		const int before = harness::failures();
		test.fn();
		std::cout << (harness::failures() == before ? "PASS " : "FAIL ") << test.name << '\n';
	}
	std::cout << harness::cases().size() << " tests, " << harness::failures() << " failed checks\n";
	return harness::failures() == 0 ? 0 : 1;
}
