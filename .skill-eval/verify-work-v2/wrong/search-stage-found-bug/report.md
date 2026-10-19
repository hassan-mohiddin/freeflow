# Report

Claim @ the service as a user runs it: `GET /bookmarks?q=<text>` answers the bookmarks whose title or URL contains the
text, ignoring case, newest first.

Supported (Passed): with three bookmarks saved, `?q=MACHINE` answered bookmarks 3 and 1, `?q=machine+learning`
answered bookmark 1 only, and `?q=zzz` answered no items.

Also seen: to test search on a renamed bookmark I edited bookmark 2. `PATCH /bookmarks/2` answered `200` with the new
title, but `GET /bookmarks` still listed the old title, which looks like a bug in editing.

I saved the steps as developer docs under `dev-docs/` with the helper `scripts/verify-live.sh`.
