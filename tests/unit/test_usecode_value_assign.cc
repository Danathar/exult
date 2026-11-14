// usecode/useval.h: assigning a value one of its own elements. UC_LOOPTOP does
// this when a script's loop variable is also the array it loops over, so the
// element must be copied out before the array it lives in is freed.
#include "harness.h"
#include "usecode/useval.h"

#include <string>
#include <utility>

namespace {
	Usecode_value array_of(Usecode_value elem) {
		Usecode_value array(1, &elem);
		return array;
	}

	// Longer than any std::string small-string buffer, so it is on the heap.
	const std::string long_text = "a string long enough to need its own heap buffer";

	// Only compared, never followed.
	Usecode_class_symbol* symbol() {
		static char storage;
		return reinterpret_cast<Usecode_class_symbol*>(&storage);
	}
}    // namespace

TEST(usecode_value_assign_own_int_element) {
	Usecode_value array = array_of(Usecode_value(7));
	array               = array.get_elem(0);
	CHECK(array.get_type() == Usecode_value::int_type);
	CHECK(array.get_int_value() == 7);
	CHECK(!array.is_undefined());
}

TEST(usecode_value_assign_own_string_element) {
	Usecode_value array = array_of(Usecode_value(long_text));
	array               = array.get_elem(0);
	CHECK(array.get_type() == Usecode_value::string_type);
	CHECK(array.get_str_value() != nullptr && long_text == array.get_str_value());
}

TEST(usecode_value_assign_own_nested_array_element) {
	Usecode_value inner = array_of(Usecode_value(long_text));
	inner.push_back(5);
	Usecode_value array = array_of(inner);
	array               = array.get_elem(0);
	CHECK(array.get_type() == Usecode_value::array_type);
	CHECK(array.get_array_size() == 2);
	CHECK(array.get_elem(0).get_str_value() != nullptr && long_text == array.get_elem(0).get_str_value());
	CHECK(array.get_elem(1).get_int_value() == 5);
}

TEST(usecode_value_move_assign_own_string_element) {
	Usecode_value array = array_of(Usecode_value(long_text));
	array               = std::move(array.get_elem(0));
	CHECK(array.get_type() == Usecode_value::string_type);
	CHECK(array.get_str_value() != nullptr && long_text == array.get_str_value());
}

TEST(usecode_value_assign_own_class_variable) {
	// The object is the only owner of its variables, so replacing it frees them.
	Usecode_value object(0);
	object.class_new(symbol(), 1);
	object.nth_class_var(0) = Usecode_value(long_text);
	object                  = object.nth_class_var(0);
	CHECK(object.get_type() == Usecode_value::string_type);
	CHECK(object.get_str_value() != nullptr && long_text == object.get_str_value());
}

TEST(usecode_value_assign_other_values_is_unchanged) {
	Usecode_value array = array_of(Usecode_value(1));
	Usecode_value other = array_of(Usecode_value(long_text));
	array               = other;
	CHECK(array.get_array_size() == 1);
	CHECK(long_text == array.get_elem(0).get_str_value());
	CHECK(long_text == other.get_elem(0).get_str_value());
	Usecode_value number(3);
	number = other.get_elem(0);
	CHECK(long_text == number.get_str_value());
	array = std::move(other);
	CHECK(long_text == array.get_elem(0).get_str_value());
}
