# Upstream issues, pull requests, and forks

This page maps the original project and everything reported against it to how
`@stackline/cfb` handles each item. It was last reviewed on 2026-10-13.

The rule for every decision: **results for existing `cfb@1.2.2` code do not
change**. A fix becomes the default only when `cfb@1.2.2` never returns, fails
on a valid file, or produces a wrong or invalid result. Everything else is
opt-in or declined.

| Status | Meaning |
| :--- | :--- |
| Fixed | Works without configuration |
| Opt-in | Available through an option; the default is unchanged |
| Supported | Already worked in `cfb@1.2.2` and still does |
| Declined | Would change `cfb@1.2.2` results or break the format; the reason is given |

## Where the original stands

- npm `cfb` stops at **1.2.2** (2022-04-06). It is not deprecated.
- [SheetJS/js-cfb](https://github.com/SheetJS/js-cfb) and its
  [git.sheetjs.com mirror](https://git.sheetjs.com/sheetjs/js-cfb) were last
  updated on 2022-11-10. `master` is two commits past 1.2.2: a README link
  change and the 31-character name limit (PR #19), never published.
- SheetJS kept fixing its embedded copy of this code in `xlsx`
  (`bits/18_cfb.js`). Those fixes never reached the `cfb` package; they are
  listed below.

## Issues (SheetJS/js-cfb)

| Issue | Problem | Status | How |
| :--- | :--- | :--- | :--- |
| [#1](https://github.com/SheetJS/js-cfb/issues/1) | `Cannot find name 'Buffer'` in the types | Supported | Fixed in cfb 1.0.4 |
| [#2](https://github.com/SheetJS/js-cfb/issues/2) | `cfb_add` rebuilds the container on every call | Supported | `cfb_add(..., {unsafe: true})` then one `cfb_gc`; documented in the README |
| [#3](https://github.com/SheetJS/js-cfb/issues/3) | MSI entry names look garbled | Supported | MSI compresses names; not a container bug |
| [#4](https://github.com/SheetJS/js-cfb/issues/4) | How to decompress VBA streams | Declined | MS-OVBA is outside the container format |
| [#5](https://github.com/SheetJS/js-cfb/issues/5) | Missing root prefix when a child precedes its parent | Supported | Fixed upstream (PR #6) |
| [#7](https://github.com/SheetJS/js-cfb/issues/7) | Endless loop in `build_full_paths` | Fixed | A cycle of parent links now raises `Directory tree cycle at entry N`; `cfb@1.2.2` raises `RangeError: Invalid string length` |
| [#8](https://github.com/SheetJS/js-cfb/issues/8) | Endless loop in `make_sector_list` | Supported | Fixed in cfb 1.1.4 |
| [#9](https://github.com/SheetJS/js-cfb/issues/9) | Memory use on large XLS files | Supported | Closed upstream; large corpus files read the same as in cfb 1.2.2 |
| [#11](https://github.com/SheetJS/js-cfb/issues/11) | Endless loop in `get_sector_list` on a damaged file | Fixed | Cyclic FAT chains raise `Cycle detected in FAT chain at sector N` |
| [#12](https://github.com/SheetJS/js-cfb/issues/12) | Quadratic `rebuild_cfb` | Supported | Fixed in cfb 1.2.1 |
| [#14](https://github.com/SheetJS/js-cfb/issues/14) | DIFAT recursion past its count | Supported | Bounded by the count in cfb 1.2.2 |
| [#15](https://github.com/SheetJS/js-cfb/issues/15) | An entry listed before its parent storage loses its path | Fixed | Entries left without a parent take it from the directory tree; no other path changes |
| [#16](https://github.com/SheetJS/js-cfb/issues/16) | `fs.readFileSync is not a function` in browsers | Supported | `type: "file"` is Node-only; documented |
| [#18](https://github.com/SheetJS/js-cfb/issues/18) | Names must fit 31 characters plus a terminator | Fixed | Names are truncated to 31 characters, as on upstream `master` |
| [#20](https://github.com/SheetJS/js-cfb/issues/20) | `file.slice is not a function` | Fixed | Passing a parsed container to `read` raises a `TypeError` that says so |
| [#21](https://github.com/SheetJS/js-cfb/issues/21) | How to update a stream inside a file | Supported | `cfb_add` replaces existing content; documented |
| [#22](https://github.com/SheetJS/js-cfb/issues/22) | Write without the `\u0001Sh33tJ5` seed stream | Opt-in | `CFB.write(cfb, {noseed: true})` |
| [#24](https://github.com/SheetJS/js-cfb/issues/24) | Keep stream order instead of sorting | Declined | [MS-CFB] 2.6.4 requires sibling order for binary search; unsorted files fail lookups in other readers |

## Pull requests (SheetJS/js-cfb)

| Pull request | Change | Status |
| :--- | :--- | :--- |
| [#6](https://github.com/SheetJS/js-cfb/pull/6) | Fix for #5 | Supported |
| [#10](https://github.com/SheetJS/js-cfb/pull/10) | Move the CLI to `cfb-cli` | Supported |
| [#13](https://github.com/SheetJS/js-cfb/pull/13) | `Buffer.copy` on write | Supported |
| [#17](https://github.com/SheetJS/js-cfb/pull/17) | Remove the unused `printj` dependency | Supported |
| [#19](https://github.com/SheetJS/js-cfb/pull/19) | Truncate names to 31 characters | Fixed |

## Fixes from the copy embedded in `xlsx`

| `xlsx` change | Problem in `cfb@1.2.2` | Status |
| :--- | :--- | :--- |
| a0bed2a9 (CVE-2024-22363) | MIME header regular expression backtracks quadratically | Fixed: `/^([^:]*?):\s*([^\s].*)$/` matches the same lines in linear time |
| 045adba8 (sheetjs#2766) | ZIP64 archives cannot be read | Fixed, following APPNOTE 4.5.3: ZIP64 end records, central directory fields, local fields, and 8-byte data descriptors |
| 5a36cb42 | Stored entries with a data descriptor are misread | Fixed; streamed stored entries also take their size from the central directory |
| 81b231d8 | String content breaks ZIP output | Fixed |
| 16dd8a6e | CRC tables assume `Int32Array#subarray` | Fixed |
| 050f66ce | Message when the directory start is out of range | Declined: both versions throw; only the message would change |
| 2022f7f4 | `require('fs')` replaced by an injected module | Declined: changes how Node loads the module |

## Security advisories

- No advisory targets the `cfb` package (GitHub Advisory Database, OSV, and
  `npm audit`).
- [CVE-2024-22363](https://www.cve.org/CVERecord?id=CVE-2024-22363) (ReDoS) is
  filed against `xlsx`; its MIME header expression is present verbatim in
  `cfb@1.2.2` and is fixed here.
- [CVE-2023-30533](https://www.cve.org/CVERecord?id=CVE-2023-30533) (prototype
  pollution) and CVE-2021-32012/32013/32014 are in `xlsx` workbook parsing, not
  in this code.

## Problems found during this review

| Problem in `cfb@1.2.2` | Status |
| :--- | :--- |
| `inflate` returns uninitialized process memory after the end of a stream that is shorter than its declared size; through `read`, a ZIP entry with a data descriptor carries that memory as content, because the CRC mismatch is only a warning | Fixed: the rest of the output is zero-filled |
| Huffman tables are shared between calls and never cleared, so damaged DEFLATE data that reaches an unused bit pattern decodes with entries left by an earlier block or stream; the result can depend on what the process decoded before | Declined: those leftover entries let `cfb@1.2.2` read some damaged files. Clearing them changed 12 results in the corruption run, 10 of them from content into errors. Valid streams never reach unused patterns |
| A stream whose child link points at itself leaves its siblings without a parent, so their paths lose the root | Fixed, with js-cfb#15 |
| `inflate` never returns on a stream that ends before its final block (a CPU loop over zero bits past the end, which can end only when its 32-bit bit offset wraps around after about 4 billion bits), or on a code of zero bits (memory passed 2 GB within 10 seconds) | Fixed: `Unexpected end of DEFLATE stream` or `Invalid DEFLATE literal/length code` |
| ZIP dates read on the 29th-31st of a month can land in the wrong month, because fields were set one by one on today's date | Fixed |
| Names of 32 or more characters were written with a 66-byte length field; the file reads back with a corrupt name and strict readers such as `olefile` reject it | Fixed (31-character limit) |
| `CFB.version` reported `1.0.2` in `@stackline/cfb` 1.0.4 | Fixed: the build writes the package version |
| `engines` required Node.js 20.19 although the code runs on 0.8 | Fixed: `>=0.8`, tested from 0.8.28 to 24 |

## Downstream reports in SheetJS/sheetjs about this code

| Report | Status |
| :--- | :--- |
| [#2766](https://github.com/SheetJS/sheetjs/issues/2766) ZIP64 workbooks | Fixed |
| [#3215](https://github.com/SheetJS/sheetjs/issues/3215), [#3244](https://github.com/SheetJS/sheetjs/issues/3244) endless CPU and memory on corrupt archives | The endless loops in `inflate` are fixed; the samples attached to these reports already fail quickly in standalone `cfb@1.2.2` |
| [#2745](https://github.com/SheetJS/sheetjs/issues/2745), [#2965](https://github.com/SheetJS/sheetjs/issues/2965), [#3274](https://github.com/SheetJS/sheetjs/issues/3274) "Bad compressed size" with data descriptors | Fixed for stored entries, including two encrypted ODS files in the test corpus; other cases were not reproduced |
| [#569](https://github.com/SheetJS/sheetjs/issues/569), [#1832](https://github.com/SheetJS/sheetjs/issues/1832), [#1872](https://github.com/SheetJS/sheetjs/issues/1872) crashes in `make_sector_list` | Supported (guarded in cfb 1.2.2) |
| [#1419](https://github.com/SheetJS/sheetjs/issues/1419), [#1442](https://github.com/SheetJS/sheetjs/issues/1442) CLSID check on WPS files | Supported (cfb 1.1.1) |

## Forks

All 16 GitHub forks of SheetJS/js-cfb were compared with upstream `master`.
Two carry their own code:

| Fork | Change | Status |
| :--- | :--- | :--- |
| `albanm/js-cfb` (`@albanm/cfb`) | FAT cycle guard in `make_sector_list` | Supported: upstream added a stronger guard in 1.1.4 |
| `YuryAlkevich/js-cfb` | Recursive directory add in the CLI | Declined: CLI only, not library behavior |

`isabella232/js-cfb` could not be inspected (the API returns 404). The others
have no commits of their own.
