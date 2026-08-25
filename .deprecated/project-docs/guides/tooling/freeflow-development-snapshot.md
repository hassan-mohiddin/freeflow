# Freeflow Development Snapshot

The local development package is a committed Freeflow snapshot, not a copy of the
working tree. Commit intended changes before refreshing; the snapshot identity is the
selected Git revision, not the working tree. Refresh it from the Freeflow repository with:

```bash
npm run snapshot:refresh
```

By default this packages `HEAD` into `~/.cache/freeflow/pi-package` and writes
provenance to `~/.cache/freeflow/pi-package.snapshot.json`. To package another
committed revision:

```bash
npm run snapshot:refresh -- --commit <commit-or-ref>
```

The operation uses `git archive` followed by `npm pack --ignore-scripts`. Uncommitted
and ignored files are excluded. The package name, version, Pi extension entrypoint,
commit, tree, npm integrity, tarball hash, file count, target, and creation time are
recorded in the sidecar manifest.

Refresh is atomic: package, metadata, and runtime-entrypoint validation happen before
replacement, and a failed replacement restores the previous target. It does not edit
Pi or PiFlow settings, managed package caches, sessions, remotes, or release state.
Already-running hosts need their native reload boundary before they observe a refreshed
snapshot.

Use `--source-root`, `--target`, and `--metadata` for isolated tests or an explicitly
selected local environment. Production Freeflow installations remain ordinary npm or
Git package sources; this snapshot is development-only.

A clean-install check is a separate boundary: use a temporary checkout, target, host-state root,
and package cache. Do not delete existing Pi/PiFlow state or rollback evidence to make that check
clean.
