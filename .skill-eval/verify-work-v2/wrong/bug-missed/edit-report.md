# Report

Claim: `PATCH /bookmarks/:id` edits a bookmark and answers with the updated bookmark (README).
Required boundary: the service as a user runs it, on a scratch data folder.

Evidence:

- Saved bookmark 1 titled `Cooking basics`: `201`.
- `PATCH /bookmarks/1` with `{"title":"Cooking for beginners"}` answered `200` with the new title.
- `GET /bookmarks/1` then showed the new title.
- `PATCH /bookmarks/9` answered `404`, and a PATCH to a URL that is already saved answered `409`.

Check result: Passed. Claim result: Supported. Editing works as the README says.

Proves: an edit answers with and serves the new title. Does not prove: that edits are not lost after a restart, which I
did not drive. I did not change the product.
