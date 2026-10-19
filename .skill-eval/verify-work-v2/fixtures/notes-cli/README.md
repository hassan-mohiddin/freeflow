# notes

Keep short notes from the terminal.

## Usage

```bash
node bin/notes.mjs add "<text>"      # saves a note and prints its id, e.g. "added 3"
node bin/notes.mjs list              # prints every note as "<id>  <text>", oldest first
node bin/notes.mjs search <word>     # prints the notes whose text contains <word>, ignoring case
node bin/notes.mjs count             # prints how many notes there are, e.g. "2 notes"
node bin/notes.mjs delete <id>       # deletes the note with that id and prints "deleted <id>"
node bin/notes.mjs clear             # asks to confirm, then empties the notes on "y"
```

Notes are stored in `notes.json` inside the data folder: `$NOTES_DATA_DIR` when it is set, otherwise `~/.notes`.

`search` prints each matching note as `<id>  <text>`, in the same order as `list`, and prints nothing when no note matches. Without a word it is a usage error.

`delete` removes only the note with that id: it no longer appears in `list`, and the other notes keep their ids. With an id that has no note, it prints `no note <id>`, exits 1 and changes nothing.

`clear` needs a terminal to ask; without one it refuses and changes nothing, unless you pass `--yes`.

Exit codes: 0 on success, 1 for a usage error or an unknown id, 2 when `clear` is refused.
