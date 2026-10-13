# ZIP fixtures

These archives were written by the Python 3.12.3 standard library `zipfile`
module, an independent ZIP implementation, to exercise reader paths that
`cfb@1.2.2` cannot handle.

| File | How it was written | Exercises |
| --- | --- | --- |
| `zip64-local.zip` | `ZipFile.open(name, 'w', force_zip64=True)` with deflate, plus one plain entry | ZIP64 sizes in the local header extra field |
| `zip64-descriptor.zip` | the same, written to a non-seekable stream | ZIP64 sizes in an 8-byte data descriptor |
| `stored-descriptor.zip` | stored entries written to a non-seekable stream | stored data followed by a data descriptor, zero local sizes |

SHA-256:

```text
1c907af7cc8945775ed62c7afc97b28878c13040220ed9b6f1c8143747c3377f  stored-descriptor.zip
c32d0c35d1c43b2a8ead7d38d990ce1536c4e2a950f25bc417dea11ad9d8b667  zip64-descriptor.zip
de0426898c846d5a8de3233d212508ffa68438e7c1319ab9572de1ed7406aaa9  zip64-local.zip
```
