/**
 ** Ucmain.cc - Usecode Compiler
 **
 ** Written: 12/30/2000 - JSF
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

#include "endianio.h"
#include "ucfun.h"
#include "ucloc.h"
#include "ucsymtbl.h"

#include <unistd.h>

#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <fstream>
#include <iosfwd>
#include <new>
#include <sstream>
#include <string_view>
#include <vector>

using std::ios;
using std::string_view_literals::operator""sv;

// THIS is what the parser produces.
extern std::vector<Uc_design_unit*> units;

std::vector<char*> include_dirs;    // -I directories.

static void compilation_status(const std::string& message, bool success) {
	if (Uc_location::get_color_output()) {
		std::cout << (success ? "\033[1;32m" : "\033[1;31m");
	}
	std::cout << message;
	if (Uc_location::get_color_output()) {
		std::cout << "\033[0m";
	}
	std::cout << '\n';
}

/*
 *  MAIN.
 */

int main(int argc, char** argv) try {
	extern int                  yyparse();
	extern FILE*                yyin;
	const char*                 src;
	std::string                 outbuf;
	const char*                 outname        = nullptr;
	bool                        want_sym_table = true;
	static const char*          optstring      = "o:I:sbc:uW:";
	Uc_function::Intrinsic_type ty             = Uc_function::unset;
	opterr                                     = 0;    // Don't let getopt() print errs.
	Uc_location::set_color_output(isatty(fileno(stderr)));
	int optchr;
	while ((optchr = getopt(argc, argv, optstring)) != -1) {
		switch (optchr) {
		case 'o':    // Output to write.
			outname = optarg;
			break;
		case 'I':    // Include dir.
			include_dirs.push_back(optarg);
			break;
		case 'c':    // Output colorization mode.
			if (optarg == "always"sv) {
				Uc_location::set_color_output(true);
			} else if (optarg == "never"sv) {
				Uc_location::set_color_output(false);
			} else if (optarg == "auto"sv) {
				Uc_location::set_color_output(isatty(fileno(stderr)));
			} else {
				std::cerr << "error: invalid color mode '" << optarg << "'; expected 'always', 'never', or 'auto'\n";
				return 1;
			}
			break;
		case 's':
			ty = Uc_function::si;
			break;
		case 'b':
			want_sym_table = false;
			break;
		case 'W':
			if (!Uc_location::set_warning_option(optarg)) {
				std::cerr << "error: unknown warning option '-W" << optarg << "'\n";
				return EXIT_FAILURE;
			}
			break;
		case 'u':
			Uc_location::set_all_warnings(false);
			break;
		case '?': {
			const char* option = optopt ? strchr(optstring, optopt) : nullptr;
			if (option && option[1] == ':') {
				std::cerr << "error: missing argument to '-" << static_cast<char>(optopt) << "'\n";
			} else {
				const char* argument = optind < argc ? argv[optind] : argv[optind - 1];
				if (strncmp(argument, "--", 2) != 0) {
					argument = argv[optind - 1];
				}
				if (strncmp(argument, "--", 2) == 0) {
					std::cerr << "error: unknown option '" << argument << "'\n";
				} else {
					std::cerr << "error: unknown option '-" << static_cast<char>(optopt) << "'\n";
				}
			}
			return EXIT_FAILURE;
		}
		}
	}
	if (argc - optind > 1) {
		std::cerr << "error: expected a single input file\n";
		return EXIT_FAILURE;
	}
	char* env = getenv("UCC_INCLUDE");
	if (env) {
		include_dirs.push_back(env);
	}
	if (optind < argc) {    // Filename?
		src  = argv[optind];
		yyin = fopen(argv[optind], "r");
		if (!yyin) {
			std::cerr << "error: cannot open input file '" << src << "': " << strerror(errno) << "\n";
			return 1;
		}
		if (!outname) {    // No -o option?
			// Set up output name.
			outbuf               = src;
			const auto separator = outbuf.find_last_of("/\\");
			const auto basename  = separator == std::string::npos ? 0 : separator + 1;
			const auto extension = outbuf.find_last_of('.');
			if (extension != std::string::npos && extension > basename) {
				outbuf.resize(extension);
			}
			outbuf += ".uco";
			outname = outbuf.c_str();
		}
	} else {
		src  = "<stdin>";
		yyin = stdin;
		if (!outname) {
			outname = "a.ucout";
		}
	}
	Uc_location::register_source(src, src);
	Uc_location::set_cur(src, 0);
	Uc_function::set_intrinsic_type(ty);
	const int parse_result = yyparse();
	if (yyin != stdin) {
		fclose(yyin);
	}
	const int errs = Uc_location::get_num_errors();
	if (parse_result != 0 || errs > 0) {    // Check for errors.
		compilation_status("Usecode compilation failed!", false);
		return EXIT_FAILURE;
	}
	// Code generation can diagnose errors too. Do not truncate an existing
	// output or leave a partial binary when one of those checks fails.
	std::ostringstream out(ios::binary | ios::out);
	if (want_sym_table) {
		little_endian::Write4(out, UCSYMTBL_MAGIC0);    // Start with symbol table.
		little_endian::Write4(out, UCSYMTBL_MAGIC1);
		auto* symtbl = new Usecode_symbol_table;
		for (auto* unit : units) {
			symtbl->add_sym(unit->create_sym());
		}
		symtbl->write(out);
		delete symtbl;
	}
	for (auto* unit : units) {
		unit->gen(out);    // Generate function.
	}

	const int final_errs = Uc_location::get_num_errors();
	if (final_errs != 0 || out.fail()) {
		compilation_status("Usecode compilation failed!", false);
		return EXIT_FAILURE;
	}
	const auto    bytecode = out.str();
	std::ofstream output(outname, ios::binary | ios::out);
	if (!output) {
		std::cerr << "error: cannot open output file '" << outname << "': " << strerror(errno) << '\n';
		return EXIT_FAILURE;
	}
	output.write(bytecode.data(), bytecode.size());
	output.close();
	if (output.fail()) {
		std::cerr << "error: failed to write output file '" << outname << "'\n";
		compilation_status("Usecode compilation failed!", false);
		return EXIT_FAILURE;
	}
	compilation_status(std::string("Usecode successfully compiled to ") + outname + "!", true);
	return EXIT_SUCCESS;
} catch (const std::bad_alloc&) {
	std::cerr << "error: memory exhausted\n";
	return EXIT_FAILURE;
} catch (const std::exception& error) {
	std::cerr << "error: internal compiler error: " << error.what() << '\n';
	return EXIT_FAILURE;
}
