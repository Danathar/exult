// usecode/ucusevars.h: reading 'gamedat/usecode.var'. An entry for a function
// the loaded usecode does not have must still have its values read, or every
// entry after it is read from the wrong place; a negative count must stop the
// read instead of reaching std::vector::resize.
#include "harness.h"
#include "usecode/ucusevars.h"

#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

namespace {
	// Stands in for Usecode_value: an int value is the type byte 0 and four
	// bytes, and any other type byte fails to restore.
	struct Fake_value {
		int value = -1;

		bool restore(IDataSource* in) {
			if (in->read1() != 0) {
				return false;
			}
			value = static_cast<int>(in->read4());
			return !in->fail();
		}
	};

	// Builds the bytes of a file the way Usecode_internal::write() does.
	class Usevars_file {
		std::ostringstream os;
		OStreamDataSource  out{&os};

	public:
		Usevars_file& count(uint32 cnt) {
			out.write4(cnt);
			return *this;
		}

		Usevars_file& value(int val) {
			out.write1(0);
			out.write4(static_cast<uint32>(val));
			return *this;
		}

		Usevars_file& bad_value() {
			out.write1(0x7e);
			return *this;
		}

		Usevars_file& id(uint32 funid) {
			out.write4(funid);
			return *this;
		}

		Usevars_file& name(const std::string& nm) {
			out.write4(0xfffffffeU);
			out.write2(static_cast<uint16>(nm.size()));
			out.write(nm);
			return *this;
		}

		Usevars_file& end() {
			out.write4(0xffffffffU);
			return *this;
		}

		std::string bytes() {
			return os.str();
		}
	};

	using Statics = std::vector<Fake_value>;

	struct Loaded {
		Statics                   globals;
		std::map<uint32, Statics> funs;
		std::string               messages;
		bool                      ok = false;
	};

	// Reads 'data' with the functions in 'funs' present and "Kept" naming
	// function 0x401.
	Loaded read(const std::string& data, std::map<uint32, Statics> funs) {
		Loaded loaded;
		loaded.funs = std::move(funs);
		std::ostringstream err;
		IBufferDataView    in(data.data(), data.size());
		loaded.ok = read_usevars_data(
				in, loaded.globals,
				[&loaded](uint32 funid) -> Statics* {
					auto it = loaded.funs.find(funid);
					return it == loaded.funs.end() ? nullptr : &it->second;
				},
				[](const char* nm, uint32& funid) {
					if (std::string(nm) == "Kept") {
						funid = 0x401;
					}
				},
				err, "usecode.var");
		loaded.messages = err.str();
		return loaded;
	}

	std::vector<int> values(const Statics& statics) {
		std::vector<int> out;
		for (const auto& value : statics) {
			out.push_back(value.value);
		}
		return out;
	}

	bool has(const std::string& text, const std::string& part) {
		return text.find(part) != std::string::npos;
	}
}    // namespace

TEST(usecode_vars_restores_every_known_function) {
	const std::string data = Usevars_file()
									 .count(2)
									 .value(10)
									 .value(11)
									 .id(0x400)
									 .count(2)
									 .value(20)
									 .value(21)
									 .id(0x402)
									 .count(0)
									 .id(0x401)
									 .count(1)
									 .value(30)
									 .end()
									 .bytes();
	const Loaded loaded
			= read(data, {
								 {0x400,         {}},
                                 {0x401,         {}},
                                 {0x402, Statics(3)}
    });
	CHECK(loaded.ok);
	CHECK(values(loaded.globals) == std::vector<int>({10, 11}));
	CHECK(values(loaded.funs.at(0x400)) == std::vector<int>({20, 21}));
	CHECK(values(loaded.funs.at(0x401)) == std::vector<int>({30}));
	CHECK(loaded.funs.at(0x402).empty());
	CHECK_EQ(loaded.messages, std::string());
}

TEST(usecode_vars_reads_past_an_unknown_function_id) {
	const std::string data
			= Usevars_file().count(0).id(0x40).count(2).value(7).value(8).id(0x400).count(2).value(1).value(2).end().bytes();
	const Loaded loaded
			= read(data, {
								 {0x400, {}}
    });
	CHECK(loaded.ok);
	CHECK(loaded.globals.empty());
	CHECK(values(loaded.funs.at(0x400)) == std::vector<int>({1, 2}));
	CHECK(has(loaded.messages, "Skipping the static usecode variables of function 0040,"));
}

TEST(usecode_vars_reads_past_an_unknown_function_name) {
	const std::string data = Usevars_file()
									 .count(1)
									 .value(5)
									 .name("Gone")
									 .count(1)
									 .value(9)
									 .name(std::string("Kept\0x", 6))
									 .count(2)
									 .value(3)
									 .value(4)
									 .id(0x400)
									 .count(1)
									 .value(6)
									 .end()
									 .bytes();
	const Loaded loaded
			= read(data, {
								 {0x400, {}},
                                 {0x401, {}}
    });
	CHECK(loaded.ok);
	CHECK(values(loaded.globals) == std::vector<int>({5}));
	CHECK(values(loaded.funs.at(0x401)) == std::vector<int>({3, 4}));
	CHECK(values(loaded.funs.at(0x400)) == std::vector<int>({6}));
	CHECK(has(loaded.messages, "function 'Gone',"));
	CHECK(!has(loaded.messages, "Kept"));
}

TEST(usecode_vars_without_end_marker_keeps_what_was_read) {
	const std::string data = Usevars_file().count(0).id(0x400).count(1).value(12).bytes();
	const Loaded      loaded
			= read(data, {
								 {0x400, {}}
    });
	CHECK(loaded.ok);
	CHECK(values(loaded.funs.at(0x400)) == std::vector<int>({12}));
}

TEST(usecode_vars_negative_global_count_stops) {
	const std::string data = Usevars_file().count(0x80000000U).id(0x400).count(1).value(12).end().bytes();
	const Loaded      loaded
			= read(data, {
								 {0x400, {}}
    });
	CHECK(!loaded.ok);
	CHECK(loaded.globals.empty());
	CHECK(loaded.funs.at(0x400).empty());
	CHECK(has(loaded.messages, "Bad count of global static usecode variables (-2147483648) in 'usecode.var'"));
}

TEST(usecode_vars_negative_function_count_stops) {
	const std::string data
			= Usevars_file().count(0).id(0x400).count(0xfffffff0U).value(1).id(0x401).count(1).value(2).end().bytes();
	const Loaded loaded
			= read(data, {
								 {0x400, Statics(1)},
                                 {0x401,         {}}
    });
	CHECK(!loaded.ok);
	CHECK_EQ(loaded.funs.at(0x400).size(), size_t(1));
	CHECK(loaded.funs.at(0x401).empty());
	CHECK(has(loaded.messages, "Bad count of static usecode variables (-16) for function 0400 in 'usecode.var'"));
}

TEST(usecode_vars_bad_global_value_stops) {
	const std::string data = Usevars_file().count(3).value(1).bad_value().value(2).id(0x400).count(1).value(3).end().bytes();
	const Loaded      loaded
			= read(data, {
								 {0x400, {}}
    });
	CHECK(!loaded.ok);
	CHECK(loaded.funs.at(0x400).empty());
	CHECK(has(loaded.messages, "Error reading global static usecode variable #1 from 'usecode.var'"));
}

TEST(usecode_vars_bad_value_in_unknown_function_stops) {
	const std::string data
			= Usevars_file().count(0).id(0xfff0).count(2).value(1).bad_value().id(0x400).count(1).value(3).end().bytes();
	const Loaded loaded
			= read(data, {
								 {0x400, {}}
    });
	CHECK(!loaded.ok);
	CHECK(loaded.funs.at(0x400).empty());
	CHECK(has(loaded.messages, "Error reading static usecode variable #1 of function fff0 from 'usecode.var'"));
}

TEST(usecode_vars_bad_value_in_known_function_stops) {
	const std::string data
			= Usevars_file().count(0).id(0x400).count(2).value(1).bad_value().id(0x401).count(1).value(3).end().bytes();
	const Loaded loaded
			= read(data, {
								 {0x400, {}},
                                 {0x401, {}}
    });
	CHECK(!loaded.ok);
	CHECK_EQ(loaded.funs.at(0x400).size(), size_t(2));
	CHECK_EQ(loaded.funs.at(0x400)[0].value, 1);
	CHECK(loaded.funs.at(0x401).empty());
	CHECK(has(loaded.messages, "Error reading static usecode variable #1 of function 0400"));
}
