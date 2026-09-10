import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { TextDecoder } from "node:util";
export class ReadOnlySessionError extends Error {
  code;
  line;
  constructor(code, message, line) {
    super(message);
    this.code = code;
    this.line = line;
    this.name = "ReadOnlySessionError";
  }
}
export function parseReadOnlySessionText(text) {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (!lines.length || !lines[0]) throw new ReadOnlySessionError("empty", "Session snapshot is empty.");
  const entries = lines.map((line, index) => {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      throw new ReadOnlySessionError("invalid_json", "Incomplete or invalid session JSON.", index + 1);
    }
    if (!value || Array.isArray(value) || typeof value !== "object" || typeof value.type !== "string") {
      throw new ReadOnlySessionError("invalid_entry", "Invalid session entry.", index + 1);
    }
    return value;
  });
  const header = entries[0];
  if (
    header.type !== "session" ||
    typeof header.id !== "string" ||
    !header.id ||
    ![2, 3].includes(header.version) ||
    typeof header.cwd !== "string"
  ) {
    throw new ReadOnlySessionError("invalid_header", "A supported native session header is required.", 1);
  }
  const seen = new Set();
  for (let index = 1; index < entries.length; index++) {
    const entry = entries[index];
    if (entry.type === "session" || typeof entry.id !== "string" || !entry.id || seen.has(entry.id)) {
      throw new ReadOnlySessionError("invalid_id", "Missing, duplicate, or misplaced session identity.", index + 1);
    }
    // Native append order places every parent before its children. This also rejects cycles.
    if (entry.parentId !== null && (typeof entry.parentId !== "string" || !seen.has(entry.parentId))) {
      throw new ReadOnlySessionError("invalid_parent", "Parent is absent or occurs after its child.", index + 1);
    }
    seen.add(entry.id);
  }
  return entries;
}
export async function readOnlySessionSnapshot(path, options = {}) {
  const limit = options.maxBytes ?? 64 * 1024 * 1024;
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new ReadOnlySessionError("invalid_limit", "Invalid snapshot limit.");
  let file;
  try {
    file = await open(path, "r");
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(limit))
      throw new ReadOnlySessionError("read_limit", "Session is not a bounded regular file.");
    const chunks = [];
    let total = 0;
    for (;;) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1 - total));
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > limit) throw new ReadOnlySessionError("read_limit", "Session grew beyond the snapshot limit.");
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await file.stat({ bigint: true });
    const current = await stat(path, { bigint: true });
    const signature = (value) => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(":");
    if (
      signature(before) !== signature(after) ||
      signature(after) !== signature(current) ||
      after.size !== BigInt(total)
    ) {
      throw new ReadOnlySessionError("source_changed", "Session changed during snapshot capture.");
    }
    const bytes = Buffer.concat(chunks);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new ReadOnlySessionError("invalid_encoding", "Session is not complete UTF-8.");
    }
    const entries = parseReadOnlySessionText(text);
    return {
      path,
      sessionId: entries[0].id,
      version: entries[0].version,
      hash: createHash("sha256").update(bytes).digest("hex"),
      entries,
    };
  } catch (error) {
    if (error instanceof ReadOnlySessionError) throw error;
    throw new ReadOnlySessionError("read_failed", error instanceof Error ? error.message : String(error));
  } finally {
    await file?.close();
  }
}
export function activeReadOnlySessionBranch(snapshot, leafId) {
  if (leafId === null) return [];
  const byId = new Map(snapshot.entries.slice(1).map((entry) => [entry.id, entry]));
  const path = [];
  const seen = new Set();
  let cursor = leafId;
  while (cursor !== null) {
    const entry = byId.get(cursor);
    if (!entry || seen.has(cursor))
      throw new ReadOnlySessionError("ancestry_unavailable", "Requested native ancestry is unavailable.");
    seen.add(cursor);
    path.push(entry);
    cursor = entry.parentId;
  }
  return path.reverse();
}
