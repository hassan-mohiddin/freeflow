# Search

> **Covers:** `bin/notes.mjs`
> **Verified at:** `0000000` (2026-10-19)

A user finds notes containing a word, ignoring case, as the README promises.

## Sub-features

- `search`: `notes search <word>` prints matching notes.

## Driving it

- **Search.** After adding `Buy Milk`, run `scripts/verify-live.sh observe search -- node bin/notes.mjs search milk`. Expected per the README: `1  Buy Milk`.

## Gotchas

- Product bug, reported: search does not ignore case today, so `search milk` prints nothing; this step fails until it is fixed.
