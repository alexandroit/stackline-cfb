# Security Policy

## Supported versions

| Version | Security updates |
| :--- | :---: |
| `1.1.x` | Yes |
| `< 1.1.0` | No |

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use the repository's
[private security advisory form](https://github.com/alexandroit/stackline-cfb/security/advisories/new).

Include:

- the affected version;
- a minimal reproducer or input file, with sensitive data removed;
- the input format (CFB, ZIP, or MIME) and the call that triggers the issue;
- the observed impact;
- the runtime;
- any proposed mitigation.

We aim to acknowledge complete reports within three business days. Confirmed
issues are fixed privately, covered by regression tests, and disclosed after a
patched release is available.

## Upstream advisories

No advisory targets the `cfb` package.
[CVE-2024-22363](https://www.cve.org/CVERecord?id=CVE-2024-22363) is filed
against `xlsx`, but its MIME header regular expression is present verbatim in
`cfb@1.2.2` and backtracks quadratically on a header line with many colons.
`@stackline/cfb` 1.1.0 and later use the expression from the `xlsx` fix, which
matches the same lines in linear time.

## Security contract

On damaged or hostile input, parsed content never includes uninitialized
memory: a DEFLATE stream shorter than its declared size is zero-filled to that
size. `cfb@1.2.2` returns leftover process memory there, which can hold data
from elsewhere in the process.

Parsing returns or throws instead of hanging:

- a FAT chain that loops throws `Cycle detected in FAT chain at sector N`;
- directory parent links that loop throw `Directory tree cycle at entry N`;
- a DEFLATE stream that ends before its final block throws
  `Unexpected end of DEFLATE stream`;
- a DEFLATE code of zero bits throws `Invalid DEFLATE literal/length code`;
- MIME header lines are matched in linear time.

`cfb@1.2.2` never returns on the first, third, and fourth inputs. Each case
has a regression test, and a differential harness compares both packages on
deterministic corruptions of the SheetJS test corpus; that harness found the
uninitialized memory above.

## Limits

The parser does not cap sizes. A valid archive can declare a large
decompressed size, and a large compound file is read into memory. On Node.js
releases before 4.5, which lack `Buffer.alloc`, the zero-filled output buffer
is written in full, so a damaged entry can use memory up to its declared size
before its size check fails; newer releases zero it lazily. Passing
tests and a clean `npm audit` are not a guarantee that every malformed file is
handled safely. When you parse untrusted files:

- limit the input size before calling `read`;
- run parsing in a worker or process with memory and time limits;
- do not pass `type: "file"` paths taken from untrusted input.
