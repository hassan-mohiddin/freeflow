# Effects and exact recovery

Read this before a Freeflow patch, exact artifact recovery, or reconciliation of a failed or unknown effect.

`freeflow_patch` accepts only an update to existing UTF-8 files: `*** Begin Patch`, one or more `*** Update File: path` sections with `@@` and contextual lines prefixed space, `-` or `+`, then `*** End Patch`. Supply the SHA-256 revision of every affected file in `expectedRevisions`. `dryRun` plans without writes. Apply may change a verified prefix before later files fail; inspect per-file `applied`, `unchanged`, `not-applied` or `unknown` and `committedPrefix`. There is no multi-file transaction or automatic rollback. Missing/unknown receipts never justify blind retry; inspect current files and settle the effect under the owning runtime before more live work.

Use `freeflow_result` for an exact needed byte range of an admitted capture or v2 artifact. `result.read@1` retains the legacy captured-text contract; `result.read@2` addresses new artifacts and can return lossless base64 when the range is binary or splits UTF-8. A head/tail segment does not contain an omitted middle. Check returned range, total bytes, hash and coverage at the stated capture boundary. If an origin store, native anchor, grant or artifact is unavailable, report that limit rather than rerun the source operation or infer missing bytes.

An operation may have completed even if the presenter or storage failed. `effectState: unknown` remains fenced until supported reconciliation; `effectState: completed` must not be relabelled no-effect by a later output failure. A caught program child failure stays in host counts. Stop when new authority, a semantic choice or uncertain effect is required; return established facts and the unresolved boundary.
