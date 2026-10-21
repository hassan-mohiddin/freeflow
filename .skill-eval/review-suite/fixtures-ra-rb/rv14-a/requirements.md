# Requirements

The change makes context archive and restore reject a batch that names the same context entry more than once.

1. `archive` takes a list of targets, each with a `ref`. If two targets name the same entry, the whole batch is rejected with status `rejected` and the message `duplicate_reference:<ref>`, where `<ref>` is the normalized reference, such as `ctx:tool-1`.
2. `restore` takes a list of references. If two references name the same entry, the whole batch is rejected the same way.
3. Duplicates are found after normalization: references are compared by the entry they name, so `ctx:tool-1` and `ctx:tool-1 ` (with trailing whitespace) are duplicates.
4. A rejected archive or restore changes nothing. The projection, and the context the next request receives, are the same as before the call.
5. A batch without duplicates is fully validated before any change is persisted. An unseen reference, a reference outside the consumed context, or an invalid reference rejects the whole batch with its existing reason.
6. An invalid reference (not a context reference, or with an empty or multi-line entry id) is rejected with its existing `..._invalid_reference` reason.
