# Deprecated Router Artifacts

Historical router artifacts kept outside the active `router/src/` runtime layout.

Use this area only for reference material that still helps explain a migration or rejected experiment. Active compatibility shims belong in `router/src/`; files with no reference value should be deleted and recovered from git history instead.

## Files

- `experimental-local-index.ts`: old root-level compatibility facade for the local-index experiment. The active experiment implementation now lives at `router/src/experiments/local-index.ts`.
