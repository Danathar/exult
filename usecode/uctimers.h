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

#ifndef UCTIMERS_H
#define UCTIMERS_H

#include "common_types.h"
#include "databuf.h"
#include "endianio.h"

#include <istream>
#include <map>

/*
 *  The timer list in 'gamedat/usecode.dat' stores each timer number in
 *  16 bits and ends with 0xffff, so only 0-0xfffe can be saved.
 */

constexpr bool is_saveable_usecode_timer(int tnum) {
	return tnum >= 0 && tnum < 0xffff;
}

/*
 *  Write the timers that are set, then the end marker.
 */

inline void write_usecode_timers(ODataSource& out, const std::map<int, uint32>& timers) {
	for (const auto& timer : timers) {
		// Don't write unused timers, or numbers the format cannot hold.
		if (!timer.second || !is_saveable_usecode_timer(timer.first)) {
			continue;
		}
		out.write2(timer.first);
		out.write4(timer.second);
	}
	out.write2(0xffff);
}

/*
 *  Read timers up to the end marker (or the end of the data).
 */

inline void read_usecode_timers(std::istream& in, std::map<int, uint32>& timers) {
	while (true) {
		const int tmr = little_endian::Read2(in);
		if (!in.good() || tmr == 0xffff) {
			break;
		}
		timers[tmr] = little_endian::Read4(in);
	}
}

#endif
