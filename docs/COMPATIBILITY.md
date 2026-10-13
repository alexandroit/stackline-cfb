# Compatibility

`@stackline/cfb` is a drop-in replacement for `cfb@1.2.2`. Code that works with
`cfb` 1.2.2 reads the same containers and writes the same bytes after the swap.
Behavior changes only where `cfb@1.2.2` never returns, cannot read a valid
file, or produces an invalid or wrong result.

```bash
npm install cfb@npm:@stackline/cfb
```

## Contract

- The API is unchanged: `read`, `parse`, `find`, `write`, `writeFile`,
  `utils`, and every option of `cfb@1.2.2`.
- Read results for intact files are identical: `FullPaths`, every `FileIndex`
  field, entry key order, dates, and content bytes. Damaged input differs only
  as listed under intentional differences below.
- Write results are byte-identical for CFB, ZIP, and ZIP with compression,
  except for names of 32 or more characters (see below).
- The package keeps the files, entry points, `browser` field, and type
  declarations of `cfb@1.2.2`.
- It has no runtime dependencies. `cfb@1.2.2` declared `adler-32` and `crc-32`
  but embeds the code it uses.
- It runs on Node.js 0.8 and newer, as `cfb@1.2.2` declares; CI exercises
  0.8.28 through 24.
- `CFB.version` reports this package's version, `1.1.0`, instead of `1.2.2`.

## How compatibility is verified

`scripts/differential.mjs` runs `cfb@1.2.2` and this package side by side, each
input in its own child process with time and memory limits, and compares every
observable result: the read container, `find`, CFB output, ZIP output with and
without compression, the container after each write, and a write-read round
trip. With `--mutations N` it also corrupts each small input N times with a
fixed seed.

```bash
npm run test:differential -- <corpus-directory>
```

Each input is reported in one class:

| Class | Meaning | Fails the run |
| :--- | :--- | :---: |
| `identical` | Every result matches | No |
| `long-name` | Only CFB writes differ, and only because a name of 32 or more characters is written as 31; the round trip matches except that each such name reads back one or two characters shorter | No |
| `local-accepts` | `cfb@1.2.2` throws and this package returns a result | No |
| `upstream-failure-fixed` | `cfb@1.2.2` times out, runs out of memory, or crashes, and this package finishes | No |
| `error-text` | Both throw, with different messages | No |
| `both-failed` | Both time out or run out of memory | No; listed in the output |
| `local-failure` | Only this package times out, runs out of memory, or crashes | Yes |
| `regression` | `cfb@1.2.2` returns a result and this package returns a different one or throws | Yes |

CI runs the harness on the repository fixtures. Results for release 1.1.0,
against the SheetJS test corpus (1,284 compound files and 1,674 ZIP
containers):

| Run | Inputs | Result |
| :--- | ---: | :--- |
| Files up to 16 MB, all operations | 2,951 | 2,924 identical; 24 long-name; 2 encrypted ODS files that `cfb@1.2.2` cannot read now read (local-accepts); 1 both-failed (memory limit of the test) |
| Files above 8 MB, reading only | 9 | 8 identical; 1 both-failed (memory limit of the test) |
| Corrupted copies of the files up to 64 KB, 10 each (seed 24301, 5-second limit) | 29,095 | No input failed only in this package; details below |

The corruption run:

| Class | Inputs | What it is |
| :--- | ---: | :--- |
| `identical` | 25,194 | |
| `upstream-failure-fixed` | 1,442 | `cfb@1.2.2` hangs or exceeds the memory limit; this package throws, mostly `Unexpected end of DEFLATE stream` |
| `error-text` | 2,411 | Both throw, with different messages; 2,190 differ only in the numbers of a checksum or size error |
| `long-name` | 19 | |
| `local-accepts` | 19 | |
| `both-failed` | 3 | Both exceed the 700 MB memory limit of the test |
| `regression` | 7 | 5 entries where `cfb@1.2.2` returned uninitialized memory, and 2 entries that `cfb@1.2.2` leaves without a parent; both are intentional differences |

`cfb@1.2.2` also varies from run to run on damaged input: it returns
uninitialized memory, and its Huffman tables keep entries from earlier streams.
Replayed one at a time against `cfb@1.2.2` with zero-filled buffers, the 5
memory cases are identical, and of 20 `error-text` inputs sampled evenly, 17
are identical, 2 hang in `cfb@1.2.2`, and 1 decodes about 4 billion bits past
the end of its data in `cfb@1.2.2` before failing its checksum.

`test/fixes.test.cjs` covers each intentional difference with a reproduction,
and asserts what `cfb@1.2.2` does where it finishes.

## Intentional differences

| Input | `cfb@1.2.2` | `@stackline/cfb` |
| :--- | :--- | :--- |
| A ZIP entry whose DEFLATE stream is shorter than its declared size, with a data descriptor | The rest of the content is uninitialized memory, which can hold data left by earlier work in the process and differ between runs | The rest is zero-filled |
| A FAT chain that loops (js-cfb#11) | Never returns | `Cycle detected in FAT chain at sector N` |
| A DEFLATE stream that ends before its final block | Keeps decoding zero bits past the end: never returns, or after about 4 billion bits its 32-bit bit offset wraps around and it decodes the data again from the start | `Unexpected end of DEFLATE stream` |
| A DEFLATE code of zero bits (invalid Huffman table) | Never returns; memory passed 2 GB within 10 seconds in testing | `Invalid DEFLATE literal/length code` |
| A MIME header line with many colons | Quadratic time (CVE-2024-22363 pattern) | Linear time, same matches |
| Directory parent links that loop | `RangeError: Invalid string length` | `Directory tree cycle at entry N` |
| An entry that `cfb@1.2.2` leaves without a parent: listed before its parent storage (js-cfb#15), or a sibling of a stream whose child link points at itself | Path without its storage or the root | Full path from the directory tree |
| ZIP64 archives | Throws | Read |
| Stored ZIP entries with a data descriptor | `Bad compressed size` | Read |
| ZIP dates read on the 29th-31st of a month | Month can shift by one | Correct date |
| Names of 32 or more characters, written to CFB | 32 characters with a 66-byte length field; reads back with a corrupt 33rd character and is rejected by strict readers | 31 characters, as on upstream `master` (js-cfb#18) |
| String content written to ZIP | Throws | Written |
| A parsed container passed to `read` (js-cfb#20) | `TypeError: file.slice is not a function` or similar | `TypeError` explaining the mistake |

`console.error` reports a truncated name in both versions; the message now
names the 31-character result.

## Opt-in additions

| Option | Default | Purpose |
| :--- | :--- | :--- |
| `CFB.write(cfb, {noseed: true})` | `false` | Write CFB output without the `\u0001Sh33tJ5` seed stream (js-cfb#22) |

The type declarations also describe `utils.use_zlib`, `utils._deflateRaw`,
`utils._inflateRaw`, and `utils.consts`, which `cfb@1.2.2` exports without
types.

See [UPSTREAM.md](https://github.com/alexandroit/stackline-cfb/blob/main/docs/UPSTREAM.md)
for every upstream issue, pull request, embedded `xlsx` fix, advisory, and
fork.
