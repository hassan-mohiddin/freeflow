# Verify Live

> **Covers:** `scripts/verify-live.sh`
> **Verified at:** `0000000` (2026-10-19)

Every check goes through `scripts/verify-live.sh`.

## Launch

`scripts/verify-live.sh launch` creates `.tmp/verify-live/runs/<run>` and sets `NOTES_DATA_DIR` there.

## Evidence

Each `observe` saves the command, output and exit code under `verify-evidence/<run>/`.

## Clean Up

`scripts/verify-live.sh cleanup` removes the run folder and keeps the evidence.
