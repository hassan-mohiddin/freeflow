# Plan: renaming tags

Goal: let people rename a tag across their whole shelf (`shelf tags rename <old> <new>`), and see tags in the web view.

## Steps

1. **Normalize tag names when a bookmark is added** (done on `feature/tag-rename`): trim and lower-case, so `Web` and
   `web ` are one tag. `normalizeTags` in `src/store.js`, with a test.
2. **Add `shelf tags rename <old> <new>`.** Load every bookmark, replace the tag in each one's `tags`, drop duplicates,
   save once. Print how many bookmarks changed. Add tests in `test/store.test.js`.
3. **Show tags in the web view.** Each bookmark's tags under its title on the list page, linking to `/?tag=<tag>`.

## Out of scope

- Merging two tags into one (rename onto an existing tag just merges them, which is fine).
- Tag colours.
