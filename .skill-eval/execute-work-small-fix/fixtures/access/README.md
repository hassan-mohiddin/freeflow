# doc-access

Who may read and change a document.

- `src/access.js`: `canView(user, doc)` and `canEdit(user, doc)`. Admins may do anything, and a document's owner may read and edit it.
- `src/share.js`: `share(doc, userId, access)` gives a user `view` or `edit` access; entries are stored in `doc.sharedWith` as `{ userId, access }`.
- `src/documents.js`: `updateDocument(user, doc, changes)` saves changes, or throws `ForbiddenError` when `canEdit` refuses.
- `data/documents.json`: stored documents. Documents created before sharing existed have no `sharedWith` field.

Run the tests with `node --test`.
