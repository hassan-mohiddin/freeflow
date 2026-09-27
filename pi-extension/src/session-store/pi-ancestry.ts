import { isStoreIdentifier, type AncestrySnapshot } from "./contracts.js";

// A Pi result is persisted after tool execution; sidecar events can name its occurrence
// before the native entry ID exists. The persisted native branch supplies that binding.
export function piAncestrySnapshot(sessionId: string, branchAnchor: string, branch: readonly any[]): AncestrySnapshot {
  const nativeOccurrences: { occurrenceId: string; entryId: string }[] = [];
  const add = (occurrenceId: unknown, entryId: unknown) => {
    if (isStoreIdentifier(occurrenceId) && isStoreIdentifier(entryId))
      nativeOccurrences.push({ occurrenceId, entryId });
  };
  for (const entry of branch) {
    if (entry?.type === "message" && entry.message?.role === "toolResult") {
      const v2 = entry.message.details?.freeflowV2;
      if (v2?.version === 1 && v2.persistence?.state === "sidecar-acknowledged") add(v2.occurrenceId, entry.id);
    } else if (entry?.type === "custom" && entry.customType === "freeflow-tool-artifact-v2") {
      const anchor = entry.data;
      if (
        anchor?.version === 1 &&
        typeof anchor.id === "string" &&
        /^artifact:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(anchor.id) &&
        isStoreIdentifier(anchor.storeId) &&
        isStoreIdentifier(anchor.originSessionId)
      )
        add(anchor.occurrenceId, entry.id);
    } else if (entry?.type === "custom" && entry.customType === "freeflow-tool-run-v1") {
      const manifest = entry.data;
      if (
        manifest?.version === 1 &&
        isStoreIdentifier(manifest.sessionId) &&
        isStoreIdentifier(manifest.runId) &&
        Array.isArray(manifest.outcomes)
      )
        for (const outcome of manifest.outcomes) add(outcome?.occurrenceId, entry.id);
    }
  }
  return {
    sessionId,
    branchAnchor,
    nativeEntryIds: branch.map((entry) => entry?.id),
    nativeOccurrences,
  };
}
