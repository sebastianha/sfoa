#!/usr/bin/make -f

all: build

build:
	cd src && zip ../sfoa.zip -r *
	mv sfoa.zip sfoa.xpi

clean:
	rm sfoa.xpi
