#!/usr/bin/make -f

all: build

build:
	rm -rf .tmp
	mkdir .tmp
	cp src/chrome/content/*.js .tmp
	cd .tmp && for i in *.js; do cat "$$i" | grep -v "///" > "../src/chrome/content/$$i"; done

	cd src && zip ../sfoa.zip -r *
	mv sfoa.zip sfoa-v`cat src/install.rdf | grep "em:version" | cut -d ">" -f 2 | cut -d "<" -f 1`.xpi

	mv .tmp/* src/chrome/content/
	rm -rf .tmp

clean:
	rm sfoa-v*.xpi

dist: build
	mv sfoa-v*.xpi dist/
