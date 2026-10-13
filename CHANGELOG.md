# Changelog

## 1.1.0 - 2026-10-13

A drop-in replacement for `cfb@1.2.2`. On the SheetJS test corpus every read
result is identical, and written bytes differ only where `cfb@1.2.2` wrote
invalid names. On damaged input this release finishes where `cfb@1.2.2` never
returns, and it never returns uninitialized memory. See
[docs/COMPATIBILITY.md](https://github.com/alexandroit/stackline-cfb/blob/main/docs/COMPATIBILITY.md)
and [docs/UPSTREAM.md](https://github.com/alexandroit/stackline-cfb/blob/main/docs/UPSTREAM.md).

### Fixed

- A ZIP entry whose DEFLATE stream is shorter than its declared size no longer
  returns uninitialized process memory in the rest of its content; the rest is
  zero-filled. `cfb@1.2.2` returns that memory when a data descriptor turns the
  CRC mismatch into a warning, and from `utils._inflateRaw` with a size.
- `inflate` no longer loops forever on a DEFLATE stream that ends before its
  final block, and no longer allocates without bound on a zero-bit code.
- The MIME header regular expression no longer backtracks quadratically
  (the `cfb` part of CVE-2024-22363).
- ZIP64 archives are read: end records, central directory and local fields,
  and 8-byte data descriptors (sheetjs#2766).
- Stored ZIP entries followed by a data descriptor are read, including streamed
  entries whose local sizes are zero; two encrypted ODS files in the test
  corpus now open.
- An entry listed before its parent storage keeps its full path (js-cfb#15),
  and so do the siblings of a stream whose child link points at itself.
- ZIP dates read on the 29th-31st of a month no longer shift by a month.
- Names of 32 or more characters are written as 31 characters, as on upstream
  `master` (js-cfb#18). `cfb@1.2.2` wrote a 66-byte name length, which read
  back as a corrupt name and is rejected by strict readers.
- String content is written correctly to ZIP output.
- Directory parent links that loop raise `Directory tree cycle at entry N`.
- Passing a parsed container to `read` raises a `TypeError` that explains the
  mistake (js-cfb#20).
- CRC tables no longer require `Int32Array#subarray`.
- `CFB.version` reports the package version again; 1.0.3 and 1.0.4 reported
  `1.0.2`.
- `engines` is `>=0.8` again, as in `cfb@1.2.2`; 1.0.x required Node.js 20.19
  although the code runs on 0.8.

### Added

- `CFB.write(cfb, {noseed: true})` writes CFB output without the
  `\u0001Sh33tJ5` seed stream (js-cfb#22).
- Type declarations for `noseed`, `utils.use_zlib`, `utils._deflateRaw`,
  `utils._inflateRaw`, and `utils.consts`.
- `scripts/differential.mjs`: compares every observable result with
  `cfb@1.2.2` over a corpus, with optional deterministic corruption.
- Regression tests for each fix, a Node.js 0.8-compatible smoke test, and CI
  jobs for Node.js 0.8.28 through 18.

## 1.0.4 - 2026-09-28

- Validate documentation badges and synchronize version labels. Published from
  the 1.0.2 tarball with only the README and package metadata changed.

## 1.0.3 - 2026-09-28

- Standardize the README, credits, and discovery metadata. Published from the
  1.0.2 tarball with only the README and package metadata changed.

## 1.0.2 - 2026-09-28

- Reuse the verified Stackline crc-32 and uglify-js forks for compatibility validation and the distribution build.

## 1.0.1 (2026-09-28)

- Standardize package documentation, preserve the API reference and upstream attribution, and add Stackline community links.
- Add focused npm discovery keywords and consistent repository metadata.
- Keep runtime behavior and dependency versions unchanged.
- Correct the pinned artifact-upload action commit while preserving the publish.yml workflow and Prod environment.

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


- Adapt the build to the existing UglifyJS 2-compatible Stackline API with named input, ES3/IE8 output, and external source maps; retain the minified-browser regression tests.
