# Requirements: transactional result publication

`publication.mjs` publishes an evaluation's staging directory to its destination as one atomic rename. It reports each outcome as a value, and it never throws to its caller for a publication failure.

1. `createStagingDirectory(path)` creates the staging directory with a non-recursive `mkdir`. It returns a complete outcome carrying the path, or an incomplete outcome carrying the primary failure message.
2. `publishResult` refuses a destination that already exists, before `prepare` runs. The refusal returns `publication-failed` with a failure message that says the destination already exists, returns no `path`, and leaves the existing destination unchanged.
3. For a destination that does not exist, `publishResult` runs `prepare`, then `verify`, creates the destination's parent directory if needed, renames the staging directory to the destination, and confirms that the destination exists. It returns `{ status: "published", path }` only after that confirmation.
4. A failure in `prepare`, `verify`, the parent `mkdir`, the rename, or the confirmation returns `publication-failed` with that failure's message and no `path`.
5. A failed rename leaves the staging directory in place.
6. `publishDiagnostic` follows the same rules for its destination: it refuses an existing destination before `writeDiagnostic` runs, and it never returns a path after a failed write, mkdir, rename, or confirmation.
7. The filesystem operations (`lstat`, `mkdir`, `rename`, `access`) can be replaced through `operations`, and a failure in any of them is reported as a failed publication.
