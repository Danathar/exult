/*
 *  ucfunction.cc - Usecode function
 *
 *  Copyright (C) 2002-2022  The Exult Team
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
 *  Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA 02111-1307, USA.
 */

#ifdef HAVE_CONFIG_H
#	include <config.h>
#endif

#include "ucfunction.h"

#include "endianio.h"
#include "exceptions.h"
#include "ucfunction_header.h"

#include <iomanip>
#include <iostream>
#include <sstream>

using std::istream;

/*
 *  Report a usecode function record that the file ends in the middle of.
 */

[[noreturn]] static void throw_truncated_function(int id) {
	std::ostringstream name;
	name << "usecode (function 0x" << std::hex << std::setw(4) << std::setfill('0') << id << " is truncated)";
	throw file_read_exception(name.str());
}

/*
 *  Read in a function.
 */

Usecode_function::Usecode_function(istream& file) : orig(nullptr) {
	id = little_endian::Read2(file);

	// support for our extended usecode format. (32 bit lengths and ids)
	if (id == 0xfffe) {
		id       = little_endian::Read4s(file);
		len      = little_endian::Read4(file);
		extended = true;
		// older extended usecode format. (32 bit lengths)
	} else if (id == 0xffff) {
		id       = little_endian::Read2(file);
		len      = little_endian::Read4(file);
		extended = true;
	} else {
		len      = little_endian::Read2(file);
		extended = false;
	}

	// A short header leaves the stream failed; read_usecode() would then
	// loop forever, because tellg() returns -1 on a failed stream.
	if (!file || len < 0) {
		throw_truncated_function(id);
	}
	code = new unsigned char[len];    // Allocate buffer & read it in.
	file.read(reinterpret_cast<char*>(code), len);
	if (!file || file.gcount() != len) {
		delete[] code;
		throw_truncated_function(id);
	}
	// Stack_frame reads the header without checking 'len'.
	if (!usecode_function_header_fits(code, static_cast<size_t>(len), extended)) {
		delete[] code;
		throw_truncated_function(id);
	}
}
