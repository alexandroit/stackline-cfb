# @stackline/cfb

> Drop-in replacement for `cfb` 1.2.2 that ends the endless loops on damaged files, fixes the CVE-2024-22363 regular expression, and reads ZIP64 archives, with identical results everywhere else. Zero dependencies; Node.js 0.8 and newer, browsers, and TypeScript.

[![npm version](https://img.shields.io/npm/v/@stackline/cfb.svg?style=flat-square)](https://www.npmjs.com/package/@stackline/cfb)
[![license](https://img.shields.io/npm/l/@stackline/cfb.svg?style=flat-square)](https://github.com/alexandroit/stackline-cfb)
[![GitHub repository](https://img.shields.io/badge/GitHub-repository-181717?style=flat-square&logo=github)](https://github.com/alexandroit/stackline-cfb)
[![Docs](https://img.shields.io/badge/docs-alexandro.net-0f766e?style=flat-square)](https://alexandro.net/docs/vanilla/cfb/)
[![Reddit community](https://img.shields.io/badge/community-r%2FStackline-ff4500?style=flat-square&logo=reddit&logoColor=white)](https://www.reddit.com/r/Stackline/)

**[Documentation](https://alexandro.net/docs/vanilla/cfb/)** | **[npm](https://www.npmjs.com/package/@stackline/cfb)** | **[Issues](https://github.com/alexandroit/stackline-cfb/issues)** | **[Repository](https://github.com/alexandroit/stackline-cfb)**

**Current package version:** `1.1.0`

---

## Why this package?

> Change one line in `package.json`. Keep every result. Stop the hangs.

`cfb@1.2.2` reads and writes OLE compound files (XLS, DOC, PPT, MSG, MSI), ZIP
containers, and MIME aggregate documents. It was last published in April 2022.
Since then SheetJS has fixed several bugs in the copy of this code embedded in
`xlsx`, including the regular expression behind CVE-2024-22363 and ZIP64
support, but never released those fixes to the `cfb` package. A damaged file
can still make `cfb@1.2.2` loop forever.

`@stackline/cfb` is built for the swap:

- **Same results.** For intact files, every read result matches `cfb@1.2.2`:
  paths, entry fields, dates, and content bytes. Written CFB and ZIP files are
  byte-identical, except that names of 32 or more characters are written as 31
  characters instead of an invalid name record.
- **Fixed by default.** Damaged files raise errors instead of hanging or
  leaking uninitialized memory into content, the MIME parser runs in linear
  time, and valid files that `cfb@1.2.2` rejects (ZIP64, stored entries with
  data descriptors) are read.
- **Verified against the original.** A differential harness runs both packages
  on the SheetJS test corpus and on deterministic corruptions of it, and
  compares every observable result.
- **Same runtimes.** No runtime dependencies, the same entry points and
  `browser` field, and CI on every Node.js line from 0.8 to 24.

<a id="trust-and-maintenance"></a>

### Trust and maintenance

- No runtime dependencies.
- Every release is built from the public repository by GitHub Actions and
  published with npm provenance.
- CI runs the upstream test suite, regression tests for every fix, the
  differential harness, type checks, a packed-consumer test, and a smoke test
  on Node.js 0.8.28 through 24.20.0.
- Security reports have a private process in
  [SECURITY.md](https://github.com/alexandroit/stackline-cfb/blob/main/SECURITY.md).
- Release history is recorded in
  [CHANGELOG.md](https://github.com/alexandroit/stackline-cfb/blob/main/CHANGELOG.md).

## Compatibility

| Item | Value |
| --- | --- |
| Package | `@stackline/cfb@1.1.0` |
| Replaces | `cfb@1.2.2` and earlier 1.x releases |
| Node.js runtime | `>=0.8` |
| Module entry | `./cfb` (CommonJS) |
| Browser builds | `dist/cfb.js`, `dist/cfb.min.js`, `dist/xlscfb.js` |
| Type declarations | `types/index.d.ts` |
| Runtime dependencies | None |

## Installation

Replace `cfb` without changing application code:

```bash
npm install cfb@npm:@stackline/cfb
```

Or install under the package's public name:

```bash
npm install @stackline/cfb
```

In the browser:

```html
<script src="dist/cfb.min.js" type="text/javascript"></script>
```

The `xlscfb.js` file is designed to be embedded in
[js-xlsx](https://github.com/SheetJS/sheetjs).

## Usage

```js
const CFB = require('cfb'); // or require('@stackline/cfb')

const container = CFB.read('report.xls', { type: 'file' });
const workbook = CFB.find(container, 'Workbook');
const data = workbook.content;
```

Create a ZIP file:

```js
const archive = CFB.utils.cfb_new();
CFB.utils.cfb_add(archive, 'hello.txt', Buffer.from('Hello'));
const bytes = CFB.write(archive, { type: 'buffer', fileType: 'zip' });
```

### What the swap fixes

| Input | `cfb@1.2.2` | `@stackline/cfb` |
| :--- | :--- | :--- |
| A ZIP entry whose DEFLATE stream is shorter than its declared size | Rest of the content is uninitialized process memory | Rest is zero-filled |
| A FAT chain that loops ([js-cfb#11](https://github.com/SheetJS/js-cfb/issues/11)) | Never returns | Throws `Cycle detected in FAT chain at sector N` |
| A DEFLATE stream that ends early, or has a zero-bit code | Never returns | Throws `Unexpected end of DEFLATE stream` or `Invalid DEFLATE literal/length code` |
| A MIME header line with many colons | Quadratic time ([CVE-2024-22363](https://www.cve.org/CVERecord?id=CVE-2024-22363) pattern) | Linear time, same matches |
| Directory parent links that loop | `RangeError: Invalid string length` | Throws `Directory tree cycle at entry N` |
| ZIP64 archives ([sheetjs#2766](https://github.com/SheetJS/sheetjs/issues/2766)) | Throws | Read |
| Stored ZIP entries with a data descriptor | Throws `Bad compressed size` | Read |
| An entry listed before its parent storage ([js-cfb#15](https://github.com/SheetJS/js-cfb/issues/15)) | Path without its storage | Full path |
| ZIP dates read on the 29th-31st of a month | Can land in the wrong month | Correct date |
| Names of 32 or more characters written to CFB ([js-cfb#18](https://github.com/SheetJS/js-cfb/issues/18)) | Invalid name record | 31 characters |
| String content written to ZIP | Throws | Written |
| A parsed container passed to `read` ([js-cfb#20](https://github.com/SheetJS/js-cfb/issues/20)) | `TypeError` from inside the parser | `TypeError` that explains the mistake |

See [Compatibility](https://github.com/alexandroit/stackline-cfb/blob/main/docs/COMPATIBILITY.md)
for the full contract and how it is verified, and
[Upstream issues](https://github.com/alexandroit/stackline-cfb/blob/main/docs/UPSTREAM.md)
for every upstream issue, pull request, embedded `xlsx` fix, advisory, and
fork.

### Write without the seed stream

`cfb@1.2.2` adds a `\u0001Sh33tJ5` stream to every CFB file it writes. Set
`noseed` to leave it out
([js-cfb#22](https://github.com/SheetJS/js-cfb/issues/22)):

```js
const bytes = CFB.write(container, { type: 'buffer', noseed: true });
```

Without the option, output is unchanged.

### Add many entries

`cfb_add` rebuilds the directory after every call. For bulk additions, skip
the checks with `unsafe` and rebuild once with `cfb_gc`
([js-cfb#2](https://github.com/SheetJS/js-cfb/issues/2)):

```js
const archive = CFB.utils.cfb_new();
for (const [name, content] of entries) {
  CFB.utils.cfb_add(archive, `/data/${name}`, content, { unsafe: true });
}
CFB.utils.cfb_gc(archive);
```

With `unsafe`, adding a name that already exists creates a duplicate entry.

### Replace a stream

`cfb_add` replaces the content of an existing entry
([js-cfb#21](https://github.com/SheetJS/js-cfb/issues/21)):

```js
const container = CFB.read('report.xls', { type: 'file' });
CFB.utils.cfb_add(container, '/Workbook', updatedBytes);
CFB.writeFile(container, 'report-updated.xls');
```

## API

TypeScript definitions are maintained in `types/index.d.ts`.

The CFB object exposes the following methods and properties:

`CFB.parse(blob)` takes a nodejs Buffer or an array of bytes and returns a
parsed representation of the data.

`CFB.read(blob, opts)` wraps `parse`.

`CFB.find(cfb, path)` performs a case-insensitive match for the path (or file
name, if there are no slashes) and returns an entry object or null if not found.

`CFB.write(cfb, opts)` generates a file based on the container.

`CFB.writeFile(cfb, filename, opts)` creates a file with the specified name.

### Parse Options

`CFB.read` takes an options argument. `opts.type` controls the behavior:

| `type`     | expected input                                                  |
|------------|:----------------------------------------------------------------|
| `"base64"` | string: Base64 encoding of the file                             |
| `"binary"` | string: binary string (byte `n` is `data.charCodeAt(n)`)        |
| `"buffer"` | nodejs Buffer                                                   |
| `"file"`   | string: path of file that will be read (nodejs only)            |
| (default)  | buffer or array of 8-bit unsigned int (byte `n` is `data[n]`)   |

`type: "file"` needs the Node.js `fs` module. In browsers, read the file first
and pass its bytes
([js-cfb#16](https://github.com/SheetJS/js-cfb/issues/16)).

### Write Options

`CFB.write` and `CFB.writeFile` take an options argument.

`opts.type` controls the behavior:

| `type`     | output                                                          |
|------------|:----------------------------------------------------------------|
| `"base64"` | string: Base64 encoding of the file                             |
| `"binary"` | string: binary string (byte `n` is `data.charCodeAt(n)`)        |
| `"buffer"` | nodejs Buffer                                                   |
| `"file"`   | string: path of file that will be created (nodejs only)         |
| (default)  | buffer if available, array of 8-bit unsigned int otherwise      |

`opts.fileType` controls the output file type:

| `fileType`         | output                  |
|:-------------------|:------------------------|
| `'cfb'` (default)  | CFB container           |
| `'zip'`            | ZIP file                |
| `'mad'`            | MIME aggregate document |

`opts.compression` enables DEFLATE compression for ZIP file type.

`opts.noseed` leaves the `\u0001Sh33tJ5` stream out of CFB output.

### Utility Functions

The utility functions are available in the `CFB.utils` object. Functions that
accept a `name` argument strictly deal with absolute file names:

- `.cfb_new(?opts)` creates a new container object.
- `.cfb_add(cfb, name, ?content, ?opts)` adds a new file to the `cfb`, or
  replaces the content of an existing one.
  Set the option `{unsafe:true}` to skip existence checks (for bulk additions)
- `.cfb_del(cfb, name)` deletes the specified file
- `.cfb_mov(cfb, old_name, new_name)` moves the old file to new path and name
- `.cfb_gc(cfb)` rebuilds the directory, for example after bulk additions
- `.use_zlib(require("zlib"))` loads a nodejs `zlib` instance.

By default, the library uses a pure JS inflate/deflate implementation. NodeJS
`zlib.InflateRaw` exposes the number of bytes read in versions after `8.11.0`.
If a supplied `zlib` does not support the required features, a warning will be
displayed in the console and the pure JS fallback will be used.

### Container Object Description

The objects returned by `parse` and `read` have the following properties:

- `.FullPaths` is an array of the names of all of the streams (files) and
  storages (directories) in the container. The paths are properly prefixed from
  the root entry (so the entries are unique)

- `.FileIndex` is an array, in the same order as `.FullPaths`, whose values are
  objects following the schema:

```typescript
interface CFBEntry {
  name: string; /** Case-sensitive internal name */
  type: number; /** 1 = dir, 2 = file, 5 = root ; see [MS-CFB] 2.6.1 */
  content: Buffer | number[] | Uint8Array; /** Raw Content */
  ct?: Date; /** Creation Time */
  mt?: Date; /** Modification Time */
  ctype?: String; /** Content-Type (for MAD) */
}
```

### Command-Line Utility

The [`cfb-cli`](https://www.npmjs.com/package/cfb-cli) module ships with a CLI
tool for manipulating and inspecting supported files.

### References

- `MS-CFB`: Compound File Binary File Format
- ZIP `APPNOTE.TXT`: .ZIP File Format Specification
- RFC1951: https://www.ietf.org/rfc/rfc1951.txt
- RFC2045: https://www.ietf.org/rfc/rfc2045.txt
- RFC2557: https://www.ietf.org/rfc/rfc2557.txt

## Security

Damaged or hostile input raises an error instead of hanging: looping FAT
chains, looping directory links, and truncated or invalid DEFLATE data are
detected, and the MIME header parser runs in linear time. Parsed content never
includes uninitialized memory, which `cfb@1.2.2` returns for a DEFLATE stream
shorter than its declared size.

The parser does not cap sizes. A valid archive can still declare a large
decompressed size, as with any ZIP reader. Limit input sizes and run untrusted
files in a worker or process with resource limits.

See the [security policy](https://github.com/alexandroit/stackline-cfb/blob/main/SECURITY.md).

## Local Development

Clone the [repository](https://github.com/alexandroit/stackline-cfb) and run
the following commands from its root:

```bash
npm ci
npm test
```

`npm test` builds the CommonJS and browser files from `bits/`, then runs the
upstream API suite, the regression tests, the Node.js 0.8-compatible smoke test,
and the type checks. Source changes belong in `bits/`; the build regenerates
`cfb.js`, `xlscfb.js`, and `dist/`.

### Differential testing

Compare this package with `cfb@1.2.2` on any directory of CFB, ZIP, and MIME
files:

```bash
npm run test:differential -- <corpus-directory>
npm run test:differential -- <corpus-directory> --mutations 10 --max-size 65536
```

Each input runs in child processes with time and memory limits. The harness
reports each input as identical, a long-name write difference, newly readable,
or a regression, and exits with 1 on a regression or on a failure that only
this package has. To reproduce a finding, pass its label from the report to
`--match` and add `--save <directory>` to keep the corrupted input. See
[how compatibility is verified](https://github.com/alexandroit/stackline-cfb/blob/main/docs/COMPATIBILITY.md#how-compatibility-is-verified).

## Consumer Smoke Test

`npm run test:package` packs the library and exercises an isolated consumer
using the repository fixture.

## Release Checklist

1. Update the package version, lockfile, generated version fields, and
   changelog together.
2. Run the development checks above and audit both `npm audit` and
   `npm audit --omit=dev`.
3. Use the [GitHub publish workflow](https://github.com/alexandroit/stackline-cfb/actions/workflows/publish.yml)
   with its `Prod` environment to publish the exact CI tarball.
4. Verify public npm bytes, package identity, provenance, and the immutable
   GitHub release evidence.

## License

[Apache-2.0](https://github.com/alexandroit/stackline-cfb/blob/main/LICENSE). Original copyright notices and upstream attribution are retained.

Please consult the attached LICENSE file for details. All rights not explicitly
granted by the Apache 2.0 License are reserved by the Original Author.

`@stackline/cfb` is an independent project and is not affiliated with or
endorsed by SheetJS LLC.

## Credits and original authors

- Original project: [js-cfb](https://github.com/SheetJS/js-cfb).
- sheetjs.
- Copyright (C) 2013-present   SheetJS LLC.
- Stackline maintenance: [Alexandro Paixao Marques](https://www.linkedin.com/in/aleinfo/) and [Stackline contributors](https://github.com/alexandroit).

Original copyright, license notices and contributor acknowledgements remain part of this distribution. Stackline maintenance does not replace authorship of the original work.

## Community and Links

- [Stackline website](https://alexandro.net/)
- [GitHub projects](https://github.com/alexandroit)
- [npm packages](https://www.npmjs.com/~alex360qc)
- [Reddit community — r/Stackline](https://www.reddit.com/r/Stackline/)
- [Maintainer LinkedIn](https://www.linkedin.com/in/aleinfo/)

Use this repository's issue tracker for reproducible bugs and feature requests. Join r/Stackline for examples, usage questions and release discussions.
