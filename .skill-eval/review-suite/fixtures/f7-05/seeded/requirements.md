# Requirements: runtime dependencies in the development snapshot

`scripts/freeflow-snapshot.mjs` builds a self-contained development snapshot of one committed Freeflow revision. This change makes the snapshot carry the package's declared runtime dependencies, installed from that revision's committed lockfile.

1. A refresh archives the selected committed revision (HEAD by default) with `git archive`. Uncommitted and ignored files are excluded.
2. When the snapshot package declares dependencies, the refresh installs the production tree from the revision's committed package-lock.json with npm ci --omit=dev --ignore-scripts --legacy-peer-deps --no-audit --no-fund; no development dependencies are installed.
3. The refresh runs npm ci with --ignore-scripts, so no lifecycle script (install, preinstall, postinstall, prepare) of an installed dependency runs.
4. A snapshot package that declares runtime dependencies but has no committed `package-lock.json` fails the refresh with an error that names the lockfile, and publishes nothing.
5. The package tarball is produced with `npm pack --ignore-scripts`. The packed package must contain every required runtime entrypoint.
6. Each installed runtime dependency is present under `node_modules` in the published package. Publication fails if a runtime dependency has no version.
7. Snapshot metadata records `runtimeDependenciesInstalled`, `packageLockSha256` (the SHA-256 of the lockfile bytes), and one `runtimeDependencies` entry per declared dependency with its name, requested spec, installed version, and lockfile integrity when the lockfile has one.
8. `packageFileCount` counts the files of the packed package. `fileCount` counts the files of the published target, so it is larger than `packageFileCount` when runtime dependencies are installed.
9. A snapshot package with no runtime dependencies is published without `node_modules`, and its metadata records `runtimeDependenciesInstalled: false` with an empty `runtimeDependencies` list.
