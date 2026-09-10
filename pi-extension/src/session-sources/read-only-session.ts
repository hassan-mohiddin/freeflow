import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { TextDecoder } from "node:util";

export interface ReadOnlySessionEntry {
  type: string;
  id: string;
  parentId?: string | null;
  [key: string]: unknown;
}
export interface ReadOnlySessionSnapshot {
  path: string;
  sessionId: string;
  version: number;
  hash: string;
  entries: readonly ReadOnlySessionEntry[];
}
export class ReadOnlySessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = "ReadOnlySessionError";
  }
}

export const SESSION_READ_LIMITS = {
  maxBytes: 512 * 1024 * 1024,
  maxEntryBytes: 128 * 1024 * 1024,
  maxEntries: 250000,
};
function decodeEntry(text: string, line: number, seen: Set<string>): ReadOnlySessionEntry {
  let value: any;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ReadOnlySessionError("invalid_json", "Incomplete or invalid session JSON.", line);
  }
  if (!value || Array.isArray(value) || typeof value !== "object" || typeof value.type !== "string")
    throw new ReadOnlySessionError("invalid_entry", "Invalid session entry.", line);
  if (line === 1) {
    if (
      value.type !== "session" ||
      typeof value.id !== "string" ||
      !value.id ||
      ![2, 3].includes(value.version) ||
      typeof value.cwd !== "string"
    )
      throw new ReadOnlySessionError("invalid_header", "A supported native session header is required.", line);
  } else {
    if (value.type === "session" || typeof value.id !== "string" || !value.id || seen.has(value.id))
      throw new ReadOnlySessionError("invalid_id", "Missing, duplicate, or misplaced session identity.", line);
    if (value.parentId !== null && (typeof value.parentId !== "string" || !seen.has(value.parentId)))
      throw new ReadOnlySessionError("invalid_parent", "Parent is absent or occurs after its child.", line);
    seen.add(value.id);
  }
  return value;
}
export function parseReadOnlySessionText(text: string): readonly ReadOnlySessionEntry[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (!lines.length || !lines[0]) throw new ReadOnlySessionError("empty", "Session snapshot is empty.");
  const seen = new Set<string>();
  return lines.map((line, i) => decodeEntry(line, i + 1, seen));
}
export async function readOnlySessionSnapshot(
  path: string,
  options: { maxBytes?: number; maxEntryBytes?: number; maxEntries?: number } = {},
): Promise<ReadOnlySessionSnapshot> {
  const limits = { ...SESSION_READ_LIMITS, ...options };
  if (Object.values(limits).some((n) => !Number.isSafeInteger(n) || n <= 0))
    throw new ReadOnlySessionError("invalid_limit", "Invalid snapshot limit.");
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(path, "r");
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) throw new ReadOnlySessionError("read_limit", "Session is not a regular file.");
    if (before.size > BigInt(limits.maxBytes))
      throw new ReadOnlySessionError(
        "read_limit",
        `Session exceeds the supported ${limits.maxBytes} byte snapshot limit.`,
      );
    const hash = createHash("sha256"),
      entries: ReadOnlySessionEntry[] = [],
      seen = new Set<string>();
    let total = 0,
      lineBytes = 0,
      parts: Buffer[] = [];
    const append = (part: Buffer) => {
      lineBytes += part.length;
      if (lineBytes > limits.maxEntryBytes)
        throw new ReadOnlySessionError(
          "entry_limit",
          `Session entry exceeds ${limits.maxEntryBytes} bytes.`,
          entries.length + 1,
        );
      if (part.length) parts.push(part);
    };
    const decode = () => {
      if (entries.length >= limits.maxEntries)
        throw new ReadOnlySessionError("entry_count_limit", `Session exceeds ${limits.maxEntries} entries.`);
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts, lineBytes));
      } catch {
        throw new ReadOnlySessionError("invalid_encoding", "Session is not complete UTF-8.", entries.length + 1);
      }
      entries.push(decodeEntry(text, entries.length + 1, seen));
      parts = [];
      lineBytes = 0;
    };
    for (;;) {
      const buffer = Buffer.alloc(64 * 1024),
        { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > limits.maxBytes)
        throw new ReadOnlySessionError("read_limit", "Session grew beyond the supported snapshot limit.");
      const bytes = buffer.subarray(0, bytesRead);
      hash.update(bytes);
      let start = 0,
        end: number;
      while ((end = bytes.indexOf(10, start)) !== -1) {
        append(bytes.subarray(start, end));
        decode();
        start = end + 1;
      }
      append(bytes.subarray(start));
    }
    if (lineBytes) decode();
    if (!entries.length) throw new ReadOnlySessionError("empty", "Session snapshot is empty.");
    const after = await file.stat({ bigint: true }),
      current = await stat(path, { bigint: true });
    const signature = (v: typeof before) => [v.dev, v.ino, v.size, v.mtimeNs, v.ctimeNs].join(":");
    if (
      signature(before) !== signature(after) ||
      signature(after) !== signature(current) ||
      after.size !== BigInt(total)
    )
      throw new ReadOnlySessionError("source_changed", "Session changed during snapshot capture.");
    return { path, sessionId: entries[0].id, version: entries[0].version as number, hash: hash.digest("hex"), entries };
  } catch (error) {
    if (error instanceof ReadOnlySessionError) throw error;
    throw new ReadOnlySessionError("read_failed", error instanceof Error ? error.message : String(error));
  } finally {
    await file?.close();
  }
}

export function activeReadOnlySessionBranch(
  snapshot: ReadOnlySessionSnapshot,
  leafId: string | null,
): readonly ReadOnlySessionEntry[] {
  if (leafId === null) return [];
  const byId = new Map(snapshot.entries.slice(1).map((entry) => [entry.id, entry]));
  const path: ReadOnlySessionEntry[] = [];
  const seen = new Set<string>();
  let cursor: string | null = leafId;
  while (cursor !== null) {
    const entry = byId.get(cursor);
    if (!entry || seen.has(cursor))
      throw new ReadOnlySessionError("ancestry_unavailable", "Requested native ancestry is unavailable.");
    seen.add(cursor);
    path.push(entry);
    cursor = entry.parentId as string | null;
  }
  return path.reverse();
}
