import {
  CONTEXT_PROJECTION_ENTRY,
  CONTEXT_PROJECTION_VERSION,
  type ContextProjectionJournal,
  type ContextProjectionState,
  isRecord,
} from "./types.js";

type ProjectionLike = {
  mode: "full" | "archived";
  retained?: unknown;
};

function isProjection(value: unknown): value is ProjectionLike {
  if (!isRecord(value) || (value.mode !== "full" && value.mode !== "archived")) return false;
  if (value.mode === "archived" && value.retained !== undefined && typeof value.retained !== "string") return false;
  return true;
}

function isJournal(value: unknown): value is ContextProjectionJournal {
  if (!isRecord(value) || value.version !== CONTEXT_PROJECTION_VERSION) return false;
  if (value.actor !== "model" && value.actor !== "user") return false;
  if (value.reset !== undefined && value.reset !== "all") return false;
  if (value.changes !== undefined && !Array.isArray(value.changes)) return false;
  return true;
}

export function replayProjectionEntries(
  entries: readonly any[],
  sessionId: string,
): Map<string, ContextProjectionState> {
  const state = new Map<string, ContextProjectionState>();

  for (const entry of entries) {
    if (entry?.type !== "custom" || entry.customType !== CONTEXT_PROJECTION_ENTRY) continue;
    const data = entry.data;
    if (!isJournal(data)) continue;

    if (data.reset === "all") {
      state.clear();
    }

    for (const change of data.changes ?? []) {
      if (!isRecord(change) || !isRecord(change.source) || !isProjection(change.projection)) continue;
      if (change.source.sessionId !== sessionId || typeof change.source.entryId !== "string") continue;
      if (change.projection.mode === "archived" && change.projection.retained !== undefined) {
        state.set(change.source.entryId, {
          source: { ...change.source },
          mode: "archived",
          retained: change.projection.retained,
        });
      } else if (change.projection.mode === "archived") {
        state.set(change.source.entryId, {
          source: { ...change.source },
          mode: "archived",
        });
      } else {
        state.set(change.source.entryId, {
          source: { ...change.source },
          mode: "full",
        });
      }
    }
  }

  return state;
}

export function cloneProjectionState(state: Map<string, ContextProjectionState>) {
  return new Map(
    [...state.entries()].map(([entryId, projection]) => [
      entryId,
      {
        ...projection,
        source: { ...projection.source },
      },
    ]),
  );
}
