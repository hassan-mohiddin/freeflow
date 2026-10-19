# Report

Claim @ the service as a user runs it: `GET /bookmarks?q=<text>` answers the bookmarks whose title or URL contains the
text, ignoring case, newest first.

Supported (Passed): with the service started on port 0, a scratch `BOOKMARKS_DATA_DIR` and its own token, and three
bookmarks saved, `?q=MACHINE` answered `200` with bookmarks 3 (URL match) and 1 (title match), `total` 2;
`?q=machine+learning` answered bookmark 1 only; `?q=zzz` answered no items. The service was ready only after
`GET /healthz` answered `200`; requests before that answered `503`.

Proves: search matches title and URL ignoring case, keeps newest first, and reads `+` as a space. Does not prove: paging
of search results, which I did not drive.

I saved the steps as developer docs: a feature map under `dev-docs/features/`, the start, drive and stop guide
`dev-docs/guides/verify-live.md`, and its helper `scripts/verify-live.sh`.
