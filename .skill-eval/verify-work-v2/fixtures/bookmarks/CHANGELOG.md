# Changelog

## 0.5.0

- Added `PATCH /bookmarks/:id`, which edits a bookmark's URL, title or tags.

## 0.4.0

- Added `q` to `GET /bookmarks`, which finds bookmarks by text in their title or URL.

## 0.3.0

- Every request except `GET /healthz` needs the access token.
