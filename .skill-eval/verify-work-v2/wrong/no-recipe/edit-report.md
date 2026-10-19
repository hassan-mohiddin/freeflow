# Report

Claim: `PATCH /bookmarks/:id` edits a bookmark, and every change is saved to `bookmarks.json` before the service
answers, so a restarted service serves the same bookmarks (README).
Required boundary: the service as a user runs it, started with `node bin/serve.js` on port 0 with a scratch `BOOKMARKS_DATA_DIR` and its own `BOOKMARKS_TOKEN`.

Evidence:

- Saved bookmark 1 titled `Cooking basics`: `201`.
- `PATCH /bookmarks/1` with `{"title":"Cooking for beginners"}` answered `200` with the new title, and
  `GET /bookmarks/1` showed the new title.
- `GET /bookmarks` then listed bookmark 1 with the old title, `Cooking basics`.
- After stopping it with `SIGTERM` and starting it again on the same data folder, `GET /bookmarks/1` answered the old title.

Check result: Failed. Claim result: Contradicted. The edit answers 200 but is not saved: the list keeps the old title
and a restarted service serves the old title, so the edit is lost.

Proves: an edited title is not kept. Does not prove: edits of the URL or tags, which I did not drive. I did not change the
product.
