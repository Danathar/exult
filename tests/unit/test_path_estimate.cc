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

// Path finder cost estimate (Tile_coord::path_estimate), which both
// Actor_pathfinder_client::estimate_cost and the wrap-around handling use.
#include "harness.h"
#include "tiles.h"

TEST(path_estimate_wraps_in_both_directions) {
	// x seam: 5 <-> 3066 is 11 tiles across the edge, so 2 * 11.
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(3066, 100, 0), Tile_coord(5, 100, 0)), 22);
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(5, 100, 0), Tile_coord(3066, 100, 0)), 22);
	// y seam.
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(100, 3066, 0), Tile_coord(100, 5, 0)), 22);
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(100, 5, 0), Tile_coord(100, 3066, 0)), 22);
	// Both axes wrap: 11 straight-diagonal steps = 3 each.
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(5, 5, 0), Tile_coord(3066, 3066, 0)), 33);
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(3066, 3066, 0), Tile_coord(5, 5, 0)), 33);
}

TEST(path_estimate_non_wrapping_unchanged) {
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(1000, 1000, 0), Tile_coord(1257, 1050, 0)), 564);
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(1257, 1050, 0), Tile_coord(1000, 1000, 0)), 564);
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(10, 10, 0), Tile_coord(10, 10, 0)), 0);
	CHECK_EQ(Tile_coord::path_estimate(Tile_coord(10, 10, 0), Tile_coord(10, 14, 2)), 8);
}

TEST(path_estimate_is_symmetric) {
	const int xs[] = {0, 5, 100, 1535, 1536, 1537, 3066, 3071};
	for (const int ax : xs) {
		for (const int bx : xs) {
			const Tile_coord a(ax, 77, 0);
			const Tile_coord b(bx, 3000, 0);
			CHECK_EQ(Tile_coord::path_estimate(a, b), Tile_coord::path_estimate(b, a));
		}
	}
}
