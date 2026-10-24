/*
 *  Copyright (C) 2026  The Exult Team
 *
 *  This program is free software; you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation; either version 2 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program; if not, write to the Free Software
 *  Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA  02111-1307, USA.
 */

// A* path finder (pathfinder/path.cc): the priority queue must keep finding
// the best node after it has grown past its initial size.
//
// tests/run-unit-tests.sh builds a fixed list of product sources, so this test
// includes the path finder sources directly. Neither needs SDL or game data.
#include "harness.h"

#include "pathfinder/PathFinder.cc"
#include "pathfinder/path.cc"

// The real definition lives in objs/objs.cc, which the unit build does not compile.
short Tile_coord::neighbors[16] = {0, -1, 1, -1, 1, 0, 1, 1, 0, 1, -1, 1, -1, 0, -1, -1};

namespace {
	// Straight steps cost 2 and diagonal steps 3, as in Actor_pathfinder_client.
	class Test_client : public Pathfinder_client {
	public:
		using Open_fn = bool (*)(int, int);
		Open_fn open_tile;

		explicit Test_client(Open_fn fn) : Pathfinder_client(0), open_tile(fn) {}

		int get_max_cost(int cost_to_goal) const override {
			const int max_cost = 3 * cost_to_goal;
			return max_cost < 240 ? 240 : max_cost;
		}

		int get_step_cost(const Tile_coord& from, Tile_coord& to) const override {
			if (!open_tile(to.tx, to.ty)) {
				return -1;
			}
			return (from.tx != to.tx && from.ty != to.ty) ? 3 : 2;
		}

		int estimate_cost(const Tile_coord& from, const Tile_coord& to) const override {
			return Tile_coord::path_estimate(from, to);
		}

		bool at_goal(const Tile_coord& tile, const Tile_coord& goal) const override {
			return tile == goal;
		}
	};

	bool Open_field(int, int) {
		return true;
	}

	// A U-shaped corridor, one tile wide: (1000,1000) up to y=940, east to x=1200, back down.
	bool U_corridor(int x, int y) {
		return (x == 1000 && y >= 940 && y <= 1000) || (y == 940 && x >= 1000 && x <= 1200) || (x == 1200 && y >= 940 && y <= 1000);
	}
}    // namespace

TEST(find_path_short_open_field_unchanged) {
	Test_client client(Open_field);
	const auto [path, found] = Find_path(Tile_coord(1000, 1000, 0), Tile_coord(1255, 1000, 0), &client);
	CHECK(found);
	CHECK_EQ(path.size(), size_t(255));
}

TEST(find_path_estimate_above_512) {
	// Estimates of 514 and 600 used to fail before the first node was expanded.
	Test_client client(Open_field);
	{
		const auto [path, found] = Find_path(Tile_coord(1000, 1000, 0), Tile_coord(1257, 1000, 0), &client);
		CHECK(found);
		CHECK_EQ(path.size(), size_t(257));
	}
	{
		const auto [path, found] = Find_path(Tile_coord(1000, 1000, 0), Tile_coord(1300, 1000, 0), &client);
		CHECK(found);
		CHECK_EQ(path.size(), size_t(300));
	}
}

TEST(find_path_corridor_queue_grows_mid_search) {
	// The start estimate is only 400, but the queue empties and refills at a
	// higher cost while walking the one-tile-wide corridor.
	Test_client      client(U_corridor);
	const Tile_coord start(1000, 1000, 0);
	const Tile_coord goal(1200, 1000, 0);
	CHECK_EQ(client.estimate_cost(start, goal), 400);
	const auto [path, found] = Find_path(start, goal, &client);
	CHECK(found);
	CHECK_EQ(path.size(), size_t(318));
}

TEST(find_path_across_world_seam) {
	// 11 tiles across the x seam, not 3061 the long way round.
	Test_client client(Open_field);
	const auto [path, found] = Find_path(Tile_coord(5, 100, 0), Tile_coord(3066, 100, 0), &client);
	CHECK(found);
	CHECK_EQ(path.size(), size_t(11));
}
