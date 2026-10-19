# Search

> **Covers:** `bin/notes.mjs`
> **Verified at:** `0000000` (2026-10-19)

A user finds notes containing a word, ignoring case.

## Sub-features

- `search-case`: `notes search <word>` prints notes containing the word in any case.

## Driving it

Preconditions:

- `scripts/verify-live.sh launch` printed the run's folder.

- **Add.** Run `scripts/verify-live.sh observe add -- node bin/notes.mjs add "Buy Milk"`. Output `added 1`.
- **Search, any case.** Run `scripts/verify-live.sh observe search -- node bin/notes.mjs search milk`. Output `1  Buy Milk`.
