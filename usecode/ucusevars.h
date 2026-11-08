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

#ifndef UCUSEVARS_H
#define UCUSEVARS_H

#include "common_types.h"
#include "databuf.h"

#include <iomanip>
#include <ostream>
#include <sstream>
#include <string>
#include <vector>

/*
 *  'gamedat/usecode.var' holds the usecode static variables: a count and
 *  that many values for the globals, then for each function its id (or
 *  0xfffffffe, a 16-bit length and its name), a count and that many values,
 *  and 0xffffffff at the end. No entry records its length in bytes, so the
 *  only way past an entry is to read its values.
 */

/*
 *  Read 'cnt' values into 'statics', or read them and drop them when
 *  'statics' is null. Returns how many values were read before one failed to
 *  restore, which is 'cnt' when all of them were read.
 */

template <typename Value>
int restore_usevar_values(IDataSource& in, std::vector<Value>* statics, int cnt) {
	if (statics) {
		statics->resize(cnt);
	}
	for (int i = 0; i < cnt; i++) {
		Value  discard;
		Value& value = statics ? (*statics)[i] : discard;
		if (!value.restore(&in)) {
			return i;
		}
	}
	return cnt;
}

/*
 *  Read the whole file into 'globals' and the function statics.
 *  'statics_of(funid)' returns the statics of that function, or null when the
 *  loaded usecode has no such function. 'symbol_id(name, funid)' sets 'funid'
 *  when the usecode knows a function by that name. Messages go to 'err'.
 *
 *  The values of a function the usecode does not have are read and dropped,
 *  so the entries after it are still read from the right place. A negative
 *  count, or a value that does not restore, stops the read, because the rest
 *  of the file can no longer be framed. Returns false when it stopped early.
 */

template <typename Value, typename Statics_of, typename Symbol_id>
bool read_usevars_data(
		IDataSource& in, std::vector<Value>& globals, Statics_of statics_of, Symbol_id symbol_id, std::ostream& err,
		const char* fname) {
	const int cnt = static_cast<int>(in.read4());    // Global statics.
	if (cnt < 0) {
		err << "Bad count of global static usecode variables (" << cnt << ") in '" << fname << "'; ignoring the file." << std::endl;
		return false;
	}
	const int nglobals = restore_usevar_values(in, &globals, cnt);
	if (nglobals != cnt) {
		err << "Error reading global static usecode variable #" << nglobals << " from '" << fname
			<< "'; ignoring the rest of the file." << std::endl;
		return false;
	}
	uint32 funid;
	while (!in.eof() && (funid = in.read4()) != 0xffffffffU) {
		std::string name;
		if (funid == 0xfffffffeU) {
			const int len = in.read2();
			in.read(name, len);
			// The name ends at the first NUL, as it always has.
			name = name.c_str();
			symbol_id(name.c_str(), funid);
		}
		std::ostringstream fun_desc;
		if (funid == 0xfffffffeU) {
			fun_desc << "'" << name << "'";
		} else {
			fun_desc << std::hex << std::setw(4) << std::setfill('0') << funid;
		}
		const int fcnt = static_cast<int>(in.read4());
		if (fcnt < 0) {
			err << "Bad count of static usecode variables (" << fcnt << ") for function " << fun_desc.str() << " in '" << fname
				<< "'; ignoring the rest of the file." << std::endl;
			return false;
		}
		std::vector<Value>* statics = statics_of(funid);
		if (!statics) {
			err << "Skipping the static usecode variables of function " << fun_desc.str()
				<< ", which the loaded usecode does not have." << std::endl;
		}
		const int nread = restore_usevar_values(in, statics, fcnt);
		if (nread != fcnt) {
			err << "Error reading static usecode variable #" << nread << " of function " << fun_desc.str() << " from '" << fname
				<< "'; ignoring the rest of the file." << std::endl;
			return false;
		}
	}
	return true;
}

#endif
