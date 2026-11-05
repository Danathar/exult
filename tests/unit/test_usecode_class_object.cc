// usecode/useval.h: class objects. Every copy shares one set of variables, and
// a script can delete the object through any copy, so the others must not be
// left pointing at freed memory.
#include "harness.h"
#include "usecode/useval.h"

#include <memory>
#include <string>
#include <utility>

namespace {
	// Only compared, never followed.
	Usecode_class_symbol* symbol() {
		static char storage;
		return reinterpret_cast<Usecode_class_symbol*>(&storage);
	}

	// A value that shares ownership with 'owner', so use_count() shows when it
	// is released. The object pointer is null and never followed.
	Usecode_value held_by(const std::shared_ptr<int>& owner) {
		return Usecode_value(Game_object_shared(owner, nullptr));
	}

	Usecode_value new_object(int nvars) {
		Usecode_value value(0);
		value.class_new(symbol(), nvars);
		return value;
	}
}    // namespace

TEST(usecode_class_object_starts_with_its_class_and_variables) {
	Usecode_value object = new_object(2);
	CHECK(object.get_type() == Usecode_value::class_obj_type);
	CHECK(object.get_class_ptr() == symbol());
	CHECK(object.get_class_var_count() == 2);
}

TEST(usecode_class_object_copies_share_variables) {
	Usecode_value object = new_object(2);
	Usecode_value copy   = object;
	object.nth_class_var(1) = Usecode_value(5);
	CHECK(copy.nth_class_var(1).get_int_value() == 5);
}

TEST(usecode_class_object_var_outside_the_object_is_a_scratch_value) {
	Usecode_value object = new_object(1);
	object.nth_class_var(0) = Usecode_value(5);
	Usecode_value& before = object.nth_class_var(-1);
	Usecode_value& after  = object.nth_class_var(1);
	CHECK(&before == &after);
	before = Usecode_value(9);
	CHECK(object.get_class_ptr() == symbol());
	CHECK(object.nth_class_var(0).get_int_value() == 5);
}

TEST(usecode_class_object_delete_resets_the_value_it_was_called_on) {
	Usecode_value object = new_object(1);
	object.class_delete();
	CHECK(object.get_type() == Usecode_value::int_type);
	CHECK(object.is_undefined());
	CHECK(object.get_int_value() == 0);
	CHECK(object.get_class_ptr() == nullptr);
}

TEST(usecode_class_object_delete_is_seen_by_every_copy) {
	Usecode_value object = new_object(2);
	Usecode_value copy   = object;
	Usecode_value popped = copy;
	popped.class_delete();
	CHECK(object.get_class_ptr() == nullptr);
	CHECK(copy.get_class_ptr() == nullptr);
	CHECK(object.get_class_var_count() == 0);
}

TEST(usecode_class_object_variables_of_a_deleted_object_are_gone) {
	Usecode_value object = new_object(2);
	Usecode_value copy   = object;
	copy.class_delete();
	Usecode_value& stale   = object.nth_class_var(0);
	Usecode_value& outside = object.nth_class_var(99);
	CHECK(&stale == &outside);
}

TEST(usecode_class_object_can_be_deleted_twice_through_copies) {
	Usecode_value object = new_object(1);
	Usecode_value first  = object;
	Usecode_value second = object;
	first.class_delete();
	second.class_delete();
	CHECK(object.get_class_ptr() == nullptr);
	CHECK(second.get_type() == Usecode_value::int_type);
}

TEST(usecode_class_object_outlives_all_but_its_last_copy) {
	Usecode_value kept(0);
	{
		Usecode_value object = new_object(1);
		object.nth_class_var(0) = Usecode_value(7);
		kept = object;
	}
	CHECK(kept.get_class_ptr() == symbol());
	CHECK(kept.nth_class_var(0).get_int_value() == 7);
}

TEST(usecode_class_object_releases_its_variables_with_its_last_copy) {
	const auto owner = std::make_shared<int>(0);
	{
		Usecode_value object = new_object(1);
		object.nth_class_var(0) = held_by(owner);
		Usecode_value copy      = object;
		CHECK(owner.use_count() == 2);
	}
	CHECK(owner.use_count() == 1);
}

TEST(usecode_class_object_delete_releases_its_variables_at_once) {
	const auto    owner  = std::make_shared<int>(0);
	Usecode_value object = new_object(1);
	object.nth_class_var(0) = held_by(owner);
	Usecode_value copy      = object;
	copy.class_delete();
	CHECK(owner.use_count() == 1);
}

TEST(usecode_class_object_stays_usable_after_being_moved_from) {
	Usecode_value object = new_object(1);
	Usecode_value moved  = std::move(object);
	CHECK(moved.get_class_ptr() == symbol());
	CHECK(object.get_class_ptr() == symbol());
	CHECK(object.get_class_var_count() == 1);
}

TEST(usecode_class_ptr_of_a_value_that_is_not_an_object_is_null) {
	CHECK(Usecode_value(3).get_class_ptr() == nullptr);
	CHECK(Usecode_value(std::string("text")).get_class_ptr() == nullptr);
	CHECK(Usecode_value(symbol()).get_class_ptr() == nullptr);
}

TEST(usecode_class_of_needs_a_class_in_the_first_element) {
	// A damaged save can give an object no elements, or an integer in element 0.
	Usecode_value::Usecode_vector elems;
	CHECK(Usecode_value::class_of(elems) == nullptr);
	elems.emplace_back(0x41414141);
	CHECK(Usecode_value::class_of(elems) == nullptr);
	elems.front() = Usecode_value(symbol());
	CHECK(Usecode_value::class_of(elems) == symbol());
}
