# Add and List

> **Covers:** `bin/notes.mjs`
> **Verified at:** `0000000` (2026-10-19)

A user saves a note and sees it in the list.

## Sub-features

- `add`: `notes add <text>` saves a note and prints its id.
- `list`: `notes list` prints every note, oldest first.

## How to get to it (user POV)

- Run `node bin/notes.mjs add "<text>"`, then `node bin/notes.mjs list`.

## Driving it

Preconditions:

- `scripts/verify-live.sh launch` printed the run's folder; `NOTES_DATA_DIR` points inside it.

- **Add.** Run `scripts/verify-live.sh observe add -- node bin/notes.mjs add "Buy Milk"`. Output `added 1`.
- **List.** Run `scripts/verify-live.sh observe list -- node bin/notes.mjs list`. Output `1  Buy Milk`.

## Gotchas

- Without `NOTES_DATA_DIR`, notes go to `~/.notes`; never drive without the helper.
