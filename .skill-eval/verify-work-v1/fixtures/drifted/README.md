# notes

Keep short notes from the terminal.

## Usage

```bash
node bin/notes.mjs add "<text>"      # saves a note and prints its id, e.g. "saved 3"
node bin/notes.mjs list              # prints every note as "<id>  <text>", oldest first
node bin/notes.mjs search <word>     # prints the notes whose text contains <word>, ignoring case
node bin/notes.mjs count             # prints how many notes there are, e.g. "2 notes"
node bin/notes.mjs clear             # asks "Delete all N notes? [y/N]" and deletes them on "y"
```

Notes are stored in `notes.json` inside the data folder: `$NOTES_DATA_DIR` when it is set, otherwise `~/.notes`.

`clear` needs a terminal to ask; without one it refuses and changes nothing, unless you pass `--yes`.

Exit codes: 0 on success, 1 for a usage error, 2 when `clear` is refused.
