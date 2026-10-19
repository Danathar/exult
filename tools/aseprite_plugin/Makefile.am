AM_CPPFLAGS = -I$(top_srcdir) -I$(top_srcdir)/files -I$(top_srcdir)/headers \
	-I$(top_srcdir)/shapes -I$(top_srcdir)/imagewin -I$(top_srcdir)/files \
	$(PNG_CFLAGS) $(INCDIRS) \
	$(DEBUG_LEVEL) $(OPT_LEVEL) $(WARNINGS) $(CPPFLAGS) -DHAVE_CONFIG_H

if BUILD_ASEPRITE_PLUGIN
ASEPRITE_PLUGINS = exult_shp
bin_PROGRAMS = $(ASEPRITE_PLUGINS)
else
ASEPRITE_PLUGINS =
endif

EXTRA_PROGRAMS = exult_shp

exult_shp_SOURCES = exult_shp.cc

exult_shp_LDADD = \
	$(top_builddir)/imagewin/libimagewin.la	\
	$(top_builddir)/shapes/libshapes.la \
	$(top_builddir)/files/libu7file.la \
	$(PNG_LIBS) $(SYSLIBS)

noinst_PROGRAMS = $(ASEPRITE_PLUGINS)

EXTRA_DIST = Readme.txt main.lua package.json u7.pal

CLEANFILES = *~
