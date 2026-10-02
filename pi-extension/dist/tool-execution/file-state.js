import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
// Files above this size are identified by size and modification time instead of a content hash.
export const HASH_LIMIT_BYTES = 8 * 1024 * 1024;
const UNICODE_SPACES = /[  -   　]/g;
/** Resolve a tool path the way Pi's tools do: strip `@`, normalize odd spaces, expand `~`, resolve against cwd. */
export function resolveToolPath(path, cwd) {
  let candidate = path.replace(UNICODE_SPACES, " ");
  if (candidate.startsWith("@")) candidate = candidate.slice(1);
  if (candidate === "~") candidate = homedir();
  else if (candidate.startsWith("~/")) candidate = `${homedir()}${candidate.slice(1)}`;
  const resolved = isAbsolute(candidate) ? resolve(candidate) : resolve(cwd, candidate);
  if (existsSync(resolved)) return resolved;
  // Pi's read also finds macOS names typed differently: narrow space before AM/PM, NFD, curly apostrophe.
  for (const variant of [
    resolved.replace(/ (AM|PM)\./gi, " $1."),
    resolved.normalize("NFD"),
    resolved.replace(/'/g, "’"),
  ])
    if (variant !== resolved && existsSync(variant)) return variant;
  return resolved;
}
function fileKey(path, cwd) {
  const resolved = resolveToolPath(path, cwd);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}
async function fingerprint(file) {
  let info;
  try {
    info = await stat(file);
  } catch {
    return "absent";
  }
  if (!info.isFile()) return "absent";
  if (info.size > HASH_LIMIT_BYTES) return { size: info.size, mtimeMs: info.mtimeMs };
  const bytes = await readFile(file);
  return { sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
}
async function statOf(file) {
  try {
    const info = await stat(file);
    return info.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : "absent";
  } catch {
    return "absent";
  }
}
const sameStat = (a, b) =>
  a !== undefined && (a === "absent" || b === "absent" ? a === b : a.size === b.size && a.mtimeMs === b.mtimeMs);
function sameFingerprint(a, b) {
  if (a === "absent" || b === "absent") return a === b;
  if ("sha256" in a && "sha256" in b) return a.sha256 === b.sha256;
  if ("mtimeMs" in a && "mtimeMs" in b) return a.size === b.size && a.mtimeMs === b.mtimeMs;
  return false;
}
/** The files a successful tool call read or changed, from a tool call's name and arguments. */
export function touchedPaths(toolName, input) {
  if (["read", "edit", "write"].includes(toolName)) return typeof input?.path === "string" ? [input.path] : [];
  if (toolName === "apply_patch" && typeof input?.input === "string")
    return [...input.input.matchAll(/^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/gm)].map(
      (match) => match[1],
    );
  return [];
}
/**
 * Which files the model has read or written on the current branch, and their content at that moment. Held in memory
 * and rebuilt from the branch after navigation or resume; never persisted and never consulted on the request path.
 */
export class FileState {
  files = new Map();
  async observe(path, cwd, via) {
    const key = fileKey(path, cwd);
    const at = await statOf(key);
    this.files.set(key, { fingerprint: await fingerprint(key), via, stat: at });
  }
  wasRead(path, cwd) {
    return this.files.has(fileKey(path, cwd));
  }
  /** Whether the file differs from its last observation; false when it was never observed. */
  async changedSinceObserved(path, cwd) {
    const key = fileKey(path, cwd);
    const known = this.files.get(key);
    if (!known) return false;
    return !sameFingerprint(known.fingerprint, await fingerprint(key));
  }
  /**
   * Observed files whose content changed since the model last read or wrote them, each reported once per change.
   * Costs one stat per observed file; a file is hashed only when its size or modification time moved.
   */
  async changedSinceNoticed() {
    const changed = [];
    for (const [key, known] of this.files) {
      const at = await statOf(key);
      if (sameStat(known.stat, at)) continue;
      known.stat = at;
      const now = await fingerprint(key);
      if (sameFingerprint(known.fingerprint, now)) continue;
      if (known.noticed !== undefined && sameFingerprint(known.noticed, now)) continue;
      known.noticed = now;
      changed.push({ path: key, deleted: now === "absent" });
    }
    return changed;
  }
  /**
   * Mark every file a successful read, edit, write or patch on the branch touched, with today's content. A Freeflow
   * compaction starts over: the model then holds only the files it carried.
   */
  async rebuild(branch, cwd) {
    this.files.clear();
    const calls = new Map();
    const touched = new Set();
    for (const entry of branch) {
      if (entry?.type === "compaction" && entry.details?.freeflow) {
        touched.clear();
        for (const item of entry.details.freeflow.carried ?? [])
          if (item?.kind === "file" && typeof item.path === "string" && !item.error) touched.add(item.path);
      }
      const message = entry?.type === "message" ? entry.message : undefined;
      if (message?.role === "assistant")
        for (const block of message.content ?? [])
          if (block?.type === "toolCall") calls.set(block.id, { name: block.name, input: block.arguments });
      if (message?.role === "toolResult" && message.isError !== true) {
        const call = calls.get(message.toolCallId);
        if (call) for (const path of touchedPaths(call.name, call.input)) touched.add(path);
      }
    }
    for (const path of touched) await this.observe(path, cwd, "rebuilt");
  }
  reset() {
    this.files.clear();
  }
}
