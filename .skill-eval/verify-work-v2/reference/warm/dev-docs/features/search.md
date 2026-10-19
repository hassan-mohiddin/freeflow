# Search

> **Covers:** `bin/notes.mjs`
> **Verified at:** `0000000` (2026-10-19)

A user finds the notes that contain a word.

## Driving it

Preconditions:

- `scripts/verify-live.sh launch` printed the run's folder; `NOTES_DATA_DIR` points inside it.

- **Add three.** Run `scripts/verify-live.sh observe add -- node bin/notes.mjs add "Buy Milk"`, then again with
  `"Call Sam"` and `"milk again"`.
- **Search.** Run `scripts/verify-live.sh observe search -- node bin/notes.mjs search MILK`. Output `1  Buy Milk` and
  `3  milk again`, exit 0.
- **No match.** Run `scripts/verify-live.sh observe search-none -- node bin/notes.mjs search zzz`. No output, exit 0.
