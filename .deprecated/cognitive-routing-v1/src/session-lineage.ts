import { closeSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";

const MAX_SESSION_HEADER_BYTES = 64 * 1024;
const MAX_SESSION_ANCESTORS = 64;

type SessionHeader = {
  type?: unknown;
  id?: unknown;
  parentSession?: unknown;
};

export type SessionLineage = {
  currentSessionId: string;
  inheritedSessionIds: ReadonlySet<string>;
  available: boolean;
};

function readSessionHeader(path: string): SessionHeader | undefined {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    const buffer = Buffer.allocUnsafe(MAX_SESSION_HEADER_BYTES);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    const firstLine = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/, 1)[0];
    const parsed = JSON.parse(firstLine) as SessionHeader;
    return parsed?.type === "session" &&
      typeof parsed.id === "string" &&
      (parsed.parentSession === undefined ||
        (typeof parsed.parentSession === "string" && parsed.parentSession.length > 0))
      ? parsed
      : undefined;
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the unavailable lineage result when closing fails.
      }
    }
  }
}

export function sessionLineageFor(ctx: any): SessionLineage | undefined {
  let currentSessionId: unknown;
  try {
    currentSessionId = ctx?.sessionManager?.getSessionId?.();
  } catch {
    return undefined;
  }
  if (typeof currentSessionId !== "string" || currentSessionId.trim().length === 0) return undefined;

  let header: SessionHeader | null | undefined;
  const getHeader = ctx?.sessionManager?.getHeader;
  if (typeof getHeader !== "function") {
    return { currentSessionId, inheritedSessionIds: new Set(), available: true };
  }
  try {
    header = getHeader.call(ctx.sessionManager);
  } catch {
    return { currentSessionId, inheritedSessionIds: new Set(), available: false };
  }
  if (!header || header.parentSession === undefined) {
    return { currentSessionId, inheritedSessionIds: new Set(), available: true };
  }
  if (typeof header.parentSession !== "string" || header.parentSession.length === 0) {
    return { currentSessionId, inheritedSessionIds: new Set(), available: false };
  }

  const inheritedSessionIds = new Set<string>();
  const visitedPaths = new Set<string>();
  let parentPath: string | undefined = header.parentSession;
  let available = true;
  while (parentPath) {
    if (inheritedSessionIds.size >= MAX_SESSION_ANCESTORS) {
      available = false;
      break;
    }
    const normalizedParentPath = resolve(parentPath);
    if (visitedPaths.has(normalizedParentPath)) {
      available = false;
      break;
    }
    visitedPaths.add(normalizedParentPath);
    const parentHeader = readSessionHeader(normalizedParentPath);
    if (!parentHeader || typeof parentHeader.id !== "string" || parentHeader.id === currentSessionId) {
      available = false;
      break;
    }
    if (inheritedSessionIds.has(parentHeader.id)) {
      available = false;
      break;
    }
    inheritedSessionIds.add(parentHeader.id);
    if (parentHeader.parentSession !== undefined && typeof parentHeader.parentSession !== "string") {
      available = false;
      break;
    }
    parentPath = parentHeader.parentSession as string | undefined;
  }

  return {
    currentSessionId,
    inheritedSessionIds: available ? inheritedSessionIds : new Set(),
    available,
  };
}
