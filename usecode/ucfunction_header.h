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

#ifndef UCFUNCTION_HEADER_H
#define UCFUNCTION_HEADER_H

#include <cstddef>
#include <cstdint>

/*
 *  Check that the header at the start of a usecode function body fits in
 *  its 'len' bytes, as Stack_frame reads it: the text-data length (2 bytes,
 *  or 4 if 'extended'), the text data, the argument, local and extern
 *  counts (2 bytes each) and the extern table (2 bytes per entry).
 *
 *  Output: true if all of it lies within the body.
 */

inline bool usecode_function_header_fits(const unsigned char* code, size_t len, bool extended) {
	const size_t len_size = extended ? 4 : 2;
	if (len < len_size) {
		return false;
	}
	// Unsigned, so a huge extended length cannot point backwards.
	uint32_t data_len = uint32_t(code[0]) | uint32_t(code[1]) << 8;
	if (extended) {
		data_len |= uint32_t(code[2]) << 16 | uint32_t(code[3]) << 24;
	}
	size_t left = len - len_size;
	if (data_len > left) {
		return false;
	}
	left -= data_len;
	// # args, # locals, # externs.
	if (left < 6) {
		return false;
	}
	left -= 6;
	const unsigned char* externs_cnt = code + len_size + data_len + 4;
	const size_t         num_externs = size_t(externs_cnt[0]) | size_t(externs_cnt[1]) << 8;
	return num_externs <= left / 2;
}

#endif
