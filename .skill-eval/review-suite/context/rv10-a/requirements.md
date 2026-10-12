# Requirements: CEV1 compact evidence

`compact-evidence.mjs` encodes an evaluation's evidence as CEV1, a compact line-oriented text whose facts trace back to exact sources, and chooses between that text and canonical JSON. Every byte count reports the UTF-8 size of the text it describes.

1. `encodeCev1(records)` writes one line per record. The header is `H|CEV1`; each other line is the record type followed by its fields as `key=value`, sorted by key and joined with `|`. The text ends with a newline. Encoding is deterministic.
2. A value containing `\`, `|`, a newline, a carriage return, or another control character is escaped so that `decodeCev1` returns the original value.
3. `decodeCev1` rejects text that does not end with a newline, a duplicate field, or an invalid escape.
4. Records must start with one `H|CEV1` header and end with one `R` record. Each `S` (source) record has an id, a kind, a path or output, a SHA-256, a non-negative integer byte count, and a recoverability class. Source ids are unique.
5. Each `F` (fact) record names a known source and has a name, value, span, and operation identity (`<name>@<sha256>`). Its recoverability cannot be stronger than its source's. A fact that breaks these rules is rejected with an error that names the field or source at fault.
6. `renderCompactEvidence` uses CEV1 only when the lineage encodes, the `R` record's `canonicalSha256` matches the canonical JSON, and the CEV1 text is strictly smaller in bytes than the canonical JSON. Otherwise it returns canonical JSON with a `reason` of `lineage-invalid` or `compact-not-smaller`.
7. The canonical text is `JSON.stringify(canonical, null, 2)` followed by a newline. `recovery.canonical_sha256` is the SHA-256 of that text.
8. `bytes.canonical` is the UTF-8 byte length of the canonical text, and `bytes.compact` is the UTF-8 byte length of the CEV1 text (null when lineage is invalid). `bytes.omitted` is `canonical - compact` when CEV1 is used, and 0 otherwise.
9. When lineage is invalid, the result carries the lineage error message in `lineage_error`.
