---
name: manifest-update
description: Update the build manifest when a package input changes.
---

# Manifest Update

Use this skill when a package input changes and the build manifest must follow.

## Steps

1. List the changed inputs.
2. Regenerate the manifest with `make manifest`.
3. Run `make test` and report the result.

## Rules

- Never hand-edit `build-manifest.generated.json`; regenerate it with `make manifest`.
- Report the test result before claiming the update is complete.
