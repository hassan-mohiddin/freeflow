import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

// Files above this size are identified by size and modification time instead of a content hash.
export const HASH_LIMIT_BYTES = 8 * 1024 * 1024;

export type FileVia = "read" | "edit" | "write" | "apply_patch" | "rebuilt";
type Fingerprint = { sha256: string; size: number } | { size: number; mtimeMs: number } | "absent";

const UNICODE_SPACES = /[  -   　]/g;

/** Resolve a tool path the way Pi's tools do: strip `@`, normalize odd spaces, expand `~`, resolve against cwd. */
export function resolveToolPath(path: string, cwd: string): string {
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

function fileKey(path: string, cwd: string): string {
  const resolved = resolveToolPath(path, cwd);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

async function fingerprint(file: string): Promise<Fingerprint> {
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

function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
  if (a === "absent" || b === "absent") return a === b;
  if ("sha256" in a && "sha256" in b) return a.sha256 === b.sha256;
  if ("mtimeMs" in a && "mtimeMs" in b) return a.size === b.size && a.mtimeMs === b.mtimeMs;
  return false;
}

/** The files a successful tool call read or changed, from a tool call's name and arguments. */
export function touchedPaths(toolName: string, input: any): string[] {
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
  private readonly files = new Map<string, { fingerprint: Fingerprint; via: FileVia }>();

  async observe(path: string, cwd: string, via: FileVia): Promise<void> {
    const key = fileKey(path, cwd);
    this.files.set(key, { fingerprint: await fingerprint(key), via });
  }

  wasRead(path: string, cwd: string): boolean {
    return this.files.has(fileKey(path, cwd));
  }

  /** Whether the file differs from its last observation; false when it was never observed. */
  async changedSinceObserved(path: string, cwd: string): Promise<boolean> {
    const key = fileKey(path, cwd);
    const known = this.files.get(key);
    if (!known) return false;
    return !sameFingerprint(known.fingerprint, await fingerprint(key));
  }

  /** Mark every file a successful read, edit, write or patch on the branch touched, with today's content. */
  async rebuild(branch: readonly any[], cwd: string): Promise<void> {
    this.files.clear();
    const calls = new Map<string, { name: string; input: any }>();
    const touched = new Set<string>();
    for (const entry of branch) {
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

  reset(): void {
    this.files.clear();
  }
}
