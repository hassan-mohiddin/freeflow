import { entryIdFromContextRef, isFreeflowContextToolName } from "./types.js";
import type { ResolvedContextEntry } from "./types.js";

export type ContextVisibilityOptions = {
  contextVirtualizationEnabled: boolean;
  isSourceFullyProjected?: (entryId: string) => boolean;
};

export type ContextVisibilitySnapshot = {
  activeEntryIds: Set<string>;
  visibleEntryIds: Set<string>;
  visibleSourceIds: Set<string>;
  materializedSourceIds: Set<string>;
};

function isFullyVisible(source: ResolvedContextEntry | undefined, options: ContextVisibilityOptions): boolean {
  if (source?.kind !== "toolResult" || !options.contextVirtualizationEnabled) return true;
  return options.isSourceFullyProjected?.(source.source.entryId) ?? true;
}

function materializedRefs(entry: any): string[] {
  const result = entry?.message?.details?.result ?? entry?.details?.result;
  if (result?.operation !== "retrieve" || !Array.isArray(result.items)) return [];
  return result.items
    .map((item: any) => entryIdFromContextRef(item?.ref))
    .filter((entryId: string | undefined): entryId is string => entryId !== undefined);
}

export function buildContextVisibility(
  activeEntries: readonly any[],
  resolvedByEntryId: ReadonlyMap<string, ResolvedContextEntry>,
  options: ContextVisibilityOptions,
): ContextVisibilitySnapshot {
  const activeEntryIds = new Set<string>();
  const visibleEntryIds = new Set<string>();
  const visibleSourceIds = new Set<string>();
  const materializedSourceIds = new Set<string>();

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
