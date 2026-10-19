# Report

Claim @ the service as a user runs it: `GET /bookmarks?q=<text>` answers the bookmarks whose title or URL contains the
text, ignoring case, newest first.

Supported (Passed): with three bookmarks saved, `?q=MACHINE` answered bookmarks 3 and 1, `?q=machine+learning`
answered bookmark 1 only, and `?q=zzz` answered no items. I did not save the steps.
