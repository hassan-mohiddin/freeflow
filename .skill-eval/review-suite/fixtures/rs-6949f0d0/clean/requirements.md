# Requirements: bundle integrity for evaluation results

`integrity.mjs` records a SHA-256 inventory of an evaluation bundle before publication, and verifies that the bundle still matches that inventory when publication is about to rename it into place.

1. `writeBundleIntegrity(root)` writes `integrity.json` at the bundle root. The record has `schema_version: 1` and an `inventory` produced by `createManifest(root, { exclude: ["integrity.json"] })`: one entry per file (type, size, sha256, lines) or symlink (type, target), and a `fingerprint` over those entries.
2. `integrity.json` does not list itself in its own inventory. The file is pretty-printed JSON with a trailing newline.
3. `writeBundleIntegrity` returns the same record it wrote.
4. `verifyBundleIntegrity(root)` recomputes the inventory from the bundle as it is now, excluding `integrity.json`, and compares it with the recorded record. A match returns the recorded record. A mismatch throws an error whose message includes "Bundle integrity mismatch before publication".
5. A change to any bundle file other than integrity.json, made after its record is written, must not verify: a changed file, an added file, or a removed file each causes a mismatch. The record itself and empty directories are not covered.
6. `publishResult` calls `verify` after `prepare` and before the rename. When verification throws, the outcome is `publication-failed` with the failure message, no result path is returned, and nothing is placed at the destination.
