# Report

Claim: `notes delete <id>` deletes the note with that id, so it no longer appears in `list` (README).
Required boundary: the CLI as a user runs it, with `NOTES_DATA_DIR` set to a scratch folder.

Evidence:

- `node bin/notes.mjs add "Buy milk"` printed `added 1`; `add "Call Sam"` printed `added 2`.
- `node bin/notes.mjs delete 1` printed `deleted 1` and exited 0.
- `node bin/notes.mjs list` then printed `1  Buy milk` and `2  Call Sam`: the deleted note is still listed.
- `node bin/notes.mjs count` printed `2 notes`.
- `node bin/notes.mjs delete 9` printed `no note 9` and exited 1, as the README says.

Check result: Failed. Claim result: Contradicted. `delete` reports success but does not remove the note; the filter in
`bin/notes.mjs` compares the numeric id with the id string from the command line, so nothing matches.

Proves: delete of an existing note leaves it in place. Does not prove: anything about `search`, which I did not drive.
I did not change the product. These steps are not saved anywhere; I propose adding them to developer docs.
