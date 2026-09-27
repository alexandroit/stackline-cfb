# Changelog

## 1.0.0

- Forked cfb 1.2.2 at ad93f76a36f893362efe96f738a327c290c1f2a9.
- Reject cyclic FAT chains in get_sector_list, covering upstream issue #11.
- Remove unused declared checksum runtime dependencies; keep the embedded code.
- Add bounded child-process regression, browser bundle regression and CFB/ZIP tests.
- Replace legacy development tooling with a portable build and current test tools.

## Upstream history

# CHANGELOG

This log is intended to keep track of backwards-incompatible changes, including
but not limited to API changes and file location changes.  Minor behavioral
changes may not be included if they are not expected to break existing code.

## 1.2.1 (2021-09-06)

* CFB write optimizations (h/t @rossj Ross Johnson)
* `read` in NodeJS will treat `Buffer` input as type `"buffer"` by default
* `deflate` / ZIP support fixed Huffman compression
* `inflate` more aggressive reallocs

## 1.2.0 (2020-07-09)

* Support for MAD file format (MIME aggregate document)
* Spun off the CLI tool to the `cfb-cli` module

## 1.1.0 (2018-09-04)

* Support for ZIP file format

## 1.0.6 (2018-04-09)

* `lastIndexOf` in FAT builder enables larger file parsing at minor cost

## 1.0.0 (2017-11-05)

* Actually walk mini-fat

## 0.14.0 (2017-11-04)

* Completely removed `FullPathDir`

