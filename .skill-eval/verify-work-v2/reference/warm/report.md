# Report

Claim @ CLI as a user runs it: `notes search <word>` prints the notes whose text contains the word, ignoring case.
Supported (Passed): with `NOTES_DATA_DIR` in a scratch folder and three notes added, `search MILK` printed
`1  Buy Milk` and `3  milk again` (exit 0); `search zzz` printed nothing (exit 0); `search` alone printed the usage
line and exited 1.

Proves: search matches case-insensitively and keeps the list order. Does not prove: words with punctuation, which I
did not drive.

I saved the steps as developer docs: a feature map under `dev-docs/features/`, the launch and clean-up guide
`dev-docs/guides/verify-live.md`, and its helper `scripts/verify-live.sh`.
