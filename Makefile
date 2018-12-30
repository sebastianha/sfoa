#!/usr/bin/make -f

all: build

build:
	cd src && zip ../sfoa.zip -r *
	mv sfoa.zip sfoa-v`cat src/install.rdf | grep "em:version" | cut -d ">" -f 2 | cut -d "<" -f 1`.xpi

clean:
	rm sfoa-v*.xpi

dist: build
	mv sfoa-v*.xpi dist/
