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

#ifndef UCINSTRUCTION_CHECKS_H
#define UCINSTRUCTION_CHECKS_H

/*
 *  Checks Usecode_internal::run() makes before it executes an instruction.
 *  Usecode comes from USECODE or a mod's PATCH_USECODE, so it is untrusted.
 *  Free of SDL so the unit tests can build it.
 */

/*
 *  Check that an instruction of 'length' bytes, opcode included, starting at
 *  'ip' ends at or before 'endp', the end of the code segment.  'ip' must
 *  already lie within the code segment.
 *
 *  Output: true if the whole instruction lies within the code segment.
 */

inline bool usecode_instruction_fits(const unsigned char* ip, const unsigned char* endp, int length) {
	return length <= endp - ip;
}

/*
 *  Check that a function has a 'this' value.  It is the last argument, so a
 *  function with no arguments has none, and Stack_frame::get_this() would
 *  read before the locals array.
 *
 *  Output: true if get_this() can be called.
 */

inline bool usecode_has_this(int num_args) {
	return num_args > 0;
}

#endif
