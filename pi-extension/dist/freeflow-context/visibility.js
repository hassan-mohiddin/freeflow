import { entryIdFromContextRef, isFreeflowContextToolName } from "./types.js";
function isFullyVisible(source, options) {
  if (source?.kind !== "toolResult" || !options.contextVirtualizationEnabled) return true;
  return options.isSourceFullyProjected?.(source.source.entryId) ?? true;
}
function materializedRefs(entry) {
  const result = entry?.message?.details?.result ?? entry?.details?.result;
  if (result?.operation !== "retrieve" || !Array.isArray(result.items)) return [];
  return result.items.map((item) => entryIdFromContextRef(item?.ref)).filter((entryId) => entryId !== undefined);
}
export function buildContextVisibility(activeEntries, resolvedByEntryId, options) {
  const activeEntryIds = new Set();
  const visibleEntryIds = new Set();
  const visibleSourceIds = new Set();
  const materializedSourceIds = new Set();
  for (const entry of activeEntries) {
    if (typeof entry?.id !== "string") continue;
    activeEntryIds.add(entry.id);
    const source = resolvedByEntryId.get(entry.id);
    if (!isFullyVisible(source, options)) continue;
    visibleEntryIds.add(entry.id);
    if (source && source.kind !== "custom") visibleSourceIds.add(entry.id);
    if (source?.kind === "toolResult" && isFreeflowContextToolName(source.message?.toolName)) {
      for (const entryId of materializedRefs(entry)) materializedSourceIds.add(entryId);
    }
  }
  return { activeEntryIds, visibleEntryIds, visibleSourceIds, materializedSourceIds };
}
