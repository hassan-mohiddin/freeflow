# Search

> **Covers:** `src/bookmarks.js`, `src/router.js`
> **Verified at:** `decfdc4` (2026-10-19)

A user finds the bookmarks whose title or URL contains some text, ignoring case.

## Driving it

Preconditions:

- `scripts/verify-live.sh start` printed `ready at <url>`.

- **Save three.** Run `scripts/verify-live.sh call add-1 POST /bookmarks '{"url":"https://example.com/ml","title":"Intro to Machine Learning"}'`, then `add-2` with `https://example.org/cooking` titled `Cooking basics`, and `add-3` with `https://machine.example.net/` titled `Tools`. Each answers `201`.
- **Search.** Run `scripts/verify-live.sh call search GET '/bookmarks?q=MACHINE'`. `200`, items 3 then 1 (one matches by URL, one by title), `total` 2.
- **Spaces.** Run `scripts/verify-live.sh call search-plus GET '/bookmarks?q=machine+learning'`. `200`, item 1 only.
- **No match.** Run `scripts/verify-live.sh call search-none GET '/bookmarks?q=zzz'`. `200`, no items, `total` 0.
