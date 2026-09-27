// A lower-level store/kernel fixture has no Pi result entry. Explicitly grant a
// synthetic owner for acknowledged occurrences; native binding has separate integration tests.
export function syntheticNativeAncestry(store, sessionId, branchAnchor = "root") {
  const owner = "entry:fixture-result";
  const occurrences = [
    ...new Set(
      store.events
        .entries()
        .map(({ event }) => event.payload?.occurrenceId)
        .filter((id) => typeof id === "string"),
    ),
  ];
  return {
    sessionId,
    branchAnchor,
    nativeEntryIds: branchAnchor === "root" || branchAnchor === owner ? [owner] : [owner, branchAnchor],
    nativeOccurrences: occurrences.map((occurrenceId) => ({ occurrenceId, entryId: owner })),
  };
}
