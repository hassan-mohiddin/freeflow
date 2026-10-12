# Requirements: atomic decision supersession in the Working Record

The change lets `update` supersede a decision in one atomic write, rejects malformed decision references before anything is written, and documents the input in `schema`.

1. `update` with `decision: { operation: "supersede", id, supersededBy }` supersedes the existing decision `id` with the existing decision `supersededBy`. In one write, `id` gets State Superseded and a "Superseded by" link, and the replacement gets a "Supersedes" link back to `id`.
2. `update` with `decision: { operation: "supersede", id, replacement: { ... } }` adds the replacement as a new decision with the next free D-NNN ID and supersedes `id` in the same write. The script assigns the ID: a caller-supplied `id` on the replacement, or on an `add`, fails with `caller-supplied-id`.
3. A supersede that gives neither `supersededBy` nor `replacement` fails with `missing-superseded-by`. A decision cannot supersede itself (`invalid-supersession`). A `supersededBy` that names no existing decision fails with `missing-entity`. An `id` that names no existing decision fails with `missing-entity`.
4. The `supersedes` and `supersededBy` values of a decision change, including those inside `replacement`, must each be a decision reference of the form D-NNN. A value that is not one fails with `invalid-decision-reference`, and the record is not written (its SHA-256 is unchanged).
5. Supersession links cannot be set through precise field edits. A precise edit that tries to set them fails with `immutable-edit-field` and leaves the record unchanged.
6. Scalar context fields (for example `currentContext.settled`) can be replaced directly with a `set` value, and the new text appears under its heading in the full view.
7. `schema --command init` describes the initialization input, including `taskName`, `whatDefinesTask` and `settled`. `schema --command update` describes the atomic decision operation and the `supersededBy` field, and states that context fields are scalar strings. `schema --help` prints usage and exits 0.
