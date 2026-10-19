/**
 ** U7drag.cc - Common defines for drag-and-drop of U7 shapes.
 **
 ** Written: 12/13/00 - JSF
 **/

/*
Copyright (C) 2000-2022 The Exult Team

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

#ifdef HAVE_CONFIG_H
#	include <config.h>
#endif

#include "u7drag.h"

#include <cstdio>
#include <cstring>
#include <memory>

#define FILE_URI "file://"
static const size_t FileUriLen = strlen(FILE_URI);

/*
 *  Check and skip the URI introducer.
 */
static bool verify_is_uri(const unsigned char*& data, const char* searched_uri) {
	const size_t urilen = strlen(searched_uri);
	// strncmp stops at the terminating NUL, so short dropped strings are not read past their end.
	const char* text = reinterpret_cast<const char*>(data);
	if (strncmp(text, searched_uri, urilen) == 0) {
		data += urilen;
		return true;
	}
	if (strncmp(text, searched_uri + FileUriLen, urilen - FileUriLen) == 0) {
		data += urilen - FileUriLen;
		return true;
	}
	return false;
}

/*
 *  Store a Shape : file, shape, frame.
 *
 *  Output: Length of data.
 */

int Store_u7_shapeid(
		unsigned char* data,
		int            file,     // 0-0xff.
		int            shape,    // 0-0xffff.
		int            frame     // 0-0xff.
) {
	return snprintf(
			reinterpret_cast<char*>(data), U7DND_DATA_LENGTH(3), FILE_URI "/%s.%d.%d.%d", U7_TARGET_SHAPEID_NAME, file, shape,
			frame);
}

/*
 *  Retrieve a Shape : file, shape, frame.
 *
 *  Output: true if the text was well formed. On failure the outputs are not modified.
 */

bool Get_u7_shapeid(
		const unsigned char* data,
		int&                 file,     // 0-0xff.
		int&                 shape,    // 0-0xffff.
		int&                 frame     // 0-0xff.
) {
	const char* ptr = strchr(reinterpret_cast<const char*>(data), '.');
	int         f;
	int         s;
	int         fr;
	if (!ptr || sscanf(ptr, ".%d.%d.%d", &f, &s, &fr) != 3) {
		return false;
	}
	file  = f;
	shape = s;
	frame = fr;
	return true;
}

/*
 *  Check a Shape.
 */

bool Is_u7_shapeid(const unsigned char* data) {
	return verify_is_uri(data, FILE_URI "/" U7_TARGET_SHAPEID_NAME ".");
}

/*
 *  Store a Chunk : chunk.
 *
 *  Output: Length of data.
 */

int Store_u7_chunkid(
		unsigned char* data,
		int            cnum    // 0-0xffff.
) {
	return snprintf(reinterpret_cast<char*>(data), U7DND_DATA_LENGTH(1), FILE_URI "/%s.%d", U7_TARGET_CHUNKID_NAME, cnum);
}

/*
 *  Retrieve a Chunk : chunk.
 *
 *  Output: true if the text was well formed. On failure the output is not modified.
 */

bool Get_u7_chunkid(
		const unsigned char* data,
		int&                 cnum    // 0-0xffff.
) {
	const char* ptr = strchr(reinterpret_cast<const char*>(data), '.');
	int         c;
	if (!ptr || sscanf(ptr, ".%d", &c) != 1) {
		return false;
	}
	cnum = c;
	return true;
}

/*
 *  Check a Chunk.
 */

bool Is_u7_chunkid(const unsigned char* data) {
	return verify_is_uri(data, FILE_URI "/" U7_TARGET_CHUNKID_NAME ".");
}

/*
 *  Store an NPC : npc.
 *
 *  Output: Length of data.
 */

int Store_u7_npcid(
		unsigned char* data,
		int            npcnum    // 0-0xffff.
) {
	return snprintf(reinterpret_cast<char*>(data), U7DND_DATA_LENGTH(1), FILE_URI "/%s.%d", U7_TARGET_NPCID_NAME, npcnum);
}

/*
 *  Retrieve an NPC.
 *
 *  Output: true if the text was well formed. On failure the output is not modified.
 */

bool Get_u7_npcid(
		const unsigned char* data,
		int&                 npcnum    // 0-0xffff.
) {
	const char* ptr = strchr(reinterpret_cast<const char*>(data), '.');
	int         num;
	if (!ptr || sscanf(ptr, ".%d", &num) != 1) {
		return false;
	}
	npcnum = num;
	return true;
}

/*
 *  Check an NPC.
 */

bool Is_u7_npcid(const unsigned char* data) {
	return verify_is_uri(data, FILE_URI "/" U7_TARGET_NPCID_NAME ".");
}

/*
 *  Store a Combo : x, y, right, below tiles, count of shapes -> each shape : x,
 * y, z, shape, frame.
 *
 *  Output: Length of data.
 */

int Store_u7_comboid(
		unsigned char* data,
		int            xtiles,         // 0-0xffff : X - Footprint in tiles.
		int            ytiles,         // 0-0xffff : Y - Footprint in tiles.
		int            tiles_right,    // 0-0xffff : Tiles to the right of the hot-spot.
		int            tiles_below,    // 0-0xffff : Tiles below the hot-spot.
		int            cnt,            // 0-0xffff : Number of members.
		U7_combo_data* ents            // The members, with locations relative - can be
									   // negative - to hot-spot.
) {
	unsigned char* ptr = data
						 + snprintf(
								 reinterpret_cast<char*>(data), U7DND_DATA_LENGTH(5), FILE_URI "/%s.%d.%d.%d.%d.%d",
								 U7_TARGET_COMBOID_NAME, xtiles, ytiles, tiles_right, tiles_below, cnt);
	for (int i = 0; i < cnt; i++) {
		ptr = ptr
			  + snprintf(
					  reinterpret_cast<char*>(ptr), U7DND_DATA_LENGTH(5 + (5 * cnt)) - (ptr - data), ".%d.%d.%d.%d.%d", ents[i].tx,
					  ents[i].ty, ents[i].tz, ents[i].shape, ents[i].frame);
	}
	return ptr - data;
}

/*
 *  Retrieve a Combo : x, y, right, below tiles, count of shapes -> each shape :
 * x, y, z, shape, frame.
 *
 *  Output: true if the text was well formed, else false (with cnt = 0 and ents = nullptr).
 *          cnt  = count of shapes.
 *          ents = Allocated (new[]) array of shapes with offsets relative to hot-spot.
 */

bool Get_u7_comboid(
		const unsigned char* data,
		int&                 xtiles,         // 0-0xffff : X - Footprint in tiles.
		int&                 ytiles,         // 0-0xffff : Y - Footprint in tiles.
		int&                 tiles_right,    // 0-0xffff : Tiles to the right of the hot-spot.
		int&                 tiles_below,    // 0-0xffff : Tiles below the hot-spot.
		int&                 cnt,            // 0-0xffff : Number of members.
		U7_combo_data*&      ents            // The members, with locations relative - can be
											 // negative - to hot-spot.
) {
	cnt  = 0;
	ents = nullptr;
	const char* ptr = strchr(reinterpret_cast<const char*>(data), '.');
	if (!ptr) {
		return false;
	}
	int n     = 0;
	int xt    = 0;
	int yt    = 0;
	int right = 0;
	int below = 0;
	int count = 0;
	if (sscanf(ptr, ".%d.%d.%d.%d.%d%n", &xt, &yt, &right, &below, &count, &n) != 5 || n <= 0) {
		return false;
	}
	if (count < 0 || count > 0xffff) {    // Cap the allocation: the count comes from untrusted text.
		return false;
	}
	ptr += n;
	std::unique_ptr<U7_combo_data[]> members(new U7_combo_data[count]());
	for (int i = 0; i < count; i++) {
		n = 0;
		if (sscanf(
					ptr, ".%d.%d.%d.%d.%d%n", &members[i].tx, &members[i].ty, &members[i].tz, &members[i].shape, &members[i].frame,
					&n)
					!= 5
			|| n <= 0) {
			return false;
		}
		ptr += n;
	}
	xtiles      = xt;
	ytiles      = yt;
	tiles_right = right;
	tiles_below = below;
	cnt         = count;
	ents        = members.release();
	return true;
}

/*
 *  Check a Combo.
 */

bool Is_u7_comboid(const unsigned char* data) {
	return verify_is_uri(data, FILE_URI "/" U7_TARGET_COMBOID_NAME ".");
}
