/*
Copyright (C) 2026 The Exult Team

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
*/

// CHUNK_SPAN and the wrapping chunk steps from exult_constants.h, as used by
// the map editor's chunk selection (Cheat::move_selected_chunks).
#include "exult_constants.h"
#include "harness.h"

#include <vector>

namespace {
	// Walk 'first'..'last' the way Cheat::move_selected_chunks does:
	// forward from 'first' when moving left/up, backward from 'last' otherwise.
	std::vector<int> walk(int first, int last, bool forward) {
		std::vector<int> visited;
		const int        n = CHUNK_SPAN(first, last);
		int              c = forward ? first : last;
		for (int i = 0; i < n; i++, c = forward ? INCR_CHUNK(c) : DECR_CHUNK(c)) {
			visited.push_back(c);
		}
		return visited;
	}
}    // namespace

TEST(chunk_span_plain_ranges) {
	CHECK_EQ(CHUNK_SPAN(0, 0), 1);
	CHECK_EQ(CHUNK_SPAN(10, 12), 3);
	CHECK_EQ(CHUNK_SPAN(190, 191), 2);
	CHECK_EQ(CHUNK_SPAN(0, c_num_chunks - 1), c_num_chunks);
}

TEST(chunk_span_wrapped_ranges) {
	CHECK_EQ(CHUNK_SPAN(c_num_chunks - 1, 0), 2);
	CHECK_EQ(CHUNK_SPAN(c_num_chunks - 2, 1), 4);
	// A full-width selection moved by one chunk is still full width.
	CHECK_EQ(CHUNK_SPAN(1, 0), c_num_chunks);
}

TEST(chunk_walk_wrapped_selection_stays_in_range) {
	// Selection 190..191 moved right once becomes 191..0 (issue #299).
	const std::vector<int> fwd = walk(c_num_chunks - 1, 0, true);
	CHECK_EQ(fwd.size(), 2u);
	CHECK_EQ(fwd[0], c_num_chunks - 1);
	CHECK_EQ(fwd[1], 0);
	const std::vector<int> back = walk(c_num_chunks - 1, 0, false);
	CHECK_EQ(back.size(), 2u);
	CHECK_EQ(back[0], 0);
	CHECK_EQ(back[1], c_num_chunks - 1);
}

TEST(chunk_walk_every_range_visits_valid_chunks_once) {
	const int samples[] = {0, 1, 5, c_num_chunks / 2, c_num_chunks - 2, c_num_chunks - 1};
	for (const int first : samples) {
		for (const int last : samples) {
			for (const bool forward : {true, false}) {
				const std::vector<int> v = walk(first, last, forward);
				CHECK_EQ(static_cast<int>(v.size()), CHUNK_SPAN(first, last));
				std::vector<int> seen(c_num_chunks, 0);
				for (const int c : v) {
					CHECK(c >= 0 && c < c_num_chunks);
					if (c >= 0 && c < c_num_chunks) {
						seen[c]++;
					}
				}
				CHECK_EQ(seen[first], 1);
				CHECK_EQ(seen[last], 1);
				for (const int count : seen) {
					CHECK(count <= 1);
				}
			}
		}
	}
}
