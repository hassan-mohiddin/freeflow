import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { lstat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";

import type { ToolExecutionState } from "../config.js";
import type { ToolScope } from "../contracts.js";
import { canonicalJson } from "../schema.js";
import { resolveRgBackend, runRg, type RgBackend } from "./rg-backend.js";
import { qualifiedSearchPath } from "./search-text.js";
import { insideWorkspace, resolveWorkspaceRoot, WorkspaceError } from "./workspace.js";

const MAX_DISCOVERY_BYTES = 1024 * 1024;
export const MAX_PROJECT_PATHS = 16;
export const MAX_DISCOVERED_FILES = 10_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const order = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

// Anchor exclusions to the admitted workspace root; an unanchored glob would
// also hide unrelated nested paths and could falsely report complete coverage.
function deniedGlobs(denyPaths: readonly string[]): string[] {
  return denyPaths.flatMap((deny) => {
    const relative = deny.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (!relative || relative.startsWith("/") || relative.split("/").includes("..")) return [];
    const literal = relative.replace(/[\\*?{}\[\]!]/g, "\\$&");
    return ["--glob", `!/${literal}`];
  });
}

export type ProjectDiscovery = Readonly<{
  backend: RgBackend;
  root: string;
  denyPaths: readonly string[];
  files: readonly string[];
}>;
export type ProjectCursor = Readonly<{
  version: 1;
  fingerprint: string;
  index: number;
  offsetBytes: number;
  matchIndex?: number;
  fileSha256?: string;
}>;

export async function authorizeProjectPaths(
  state: ToolExecutionState | undefined,
  scope: ToolScope,
  requested: readonly string[],
): Promise<void> {
  const { root, denyPaths } = await resolveWorkspaceRoot(state, scope);
  for (const item of requested) {
    if (!item || item.includes("\0") || isAbsolute(item))
      throw new WorkspaceError("path_invalid", "Search paths must be project-relative.");
    const path = resolve(root, item);
    if (!insideWorkspace(root, path)) throw new WorkspaceError("path_outside_root", "Search path escapes the root.");
    await qualifiedSearchPath(root, denyPaths, path, true);
  }
}

export async function discoverProjectFiles(
  state: ToolExecutionState | undefined,
  scope: ToolScope,
  requested: readonly string[],
  signal?: AbortSignal,
): Promise<ProjectDiscovery> {
  await authorizeProjectPaths(state, scope, requested);
  const { root, denyPaths } = await resolveWorkspaceRoot(state, scope);
  const backend = await resolveRgBackend(signal);
  // Enumerate names only. File content is admitted and verified separately before searching.
  const result = await runRg(
    backend,
    [
      "--files",
      "-0",
      "--hidden",
      "--no-require-git",
      ...deniedGlobs(denyPaths),
      "--",
      ...requested.map((item) => relative(root, resolve(root, item)) || "."),
    ],
    signal,
    MAX_DISCOVERY_BYTES,
    root,
  );
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(result.bytes);
  } catch {
    throw new WorkspaceError("path_encoding", "Ripgrep returned a non-UTF-8 project path.");
  }
  const files = new Set<string>();
  for (const name of decoded.split("\0")) {
    if (!name) continue;
    const path = isAbsolute(name) ? resolve(name) : resolve(root, name);
    if (!insideWorkspace(root, path))
      throw new WorkspaceError("path_outside_root", "Ripgrep returned a path outside the project root.");
    if (!(await qualifiedSearchPath(root, denyPaths, path, false))) continue;
    const info = await lstat(path).catch(() => undefined);
    if (!info || !info.isFile() || info.isSymbolicLink()) continue;
    files.add(relative(root, path).replaceAll("\\", "/"));
    if (files.size > MAX_DISCOVERED_FILES)
      throw new WorkspaceError("search_too_large", "Ripgrep file discovery exceeds the bounded candidate limit.");
  }
  return { backend, root, denyPaths, files: [...files].sort(order) };
}

export function projectFingerprint(source: ProjectDiscovery, request: unknown): string {
  return hash(
    canonicalJson({
      backend: source.backend.identity,
      root: source.root,
      denyPaths: [...source.denyPaths],
      files: [...source.files],
      request,
    } as any),
  );
}

function cursorSeal(cursor: ProjectCursor, key: Buffer): Buffer {
  return createHmac("sha256", key)
    .update(canonicalJson(cursor as any))
    .digest();
}

// A cursor is a continuation receipt, not a permission. A runtime-local seal
// prevents a changed index from turning a partial page into false completeness.
export function encodeProjectCursor(cursor: ProjectCursor, key: Buffer): string {
  return Buffer.from(
    canonicalJson({ ...cursor, seal: cursorSeal(cursor, key).toString("hex") } as any),
    "utf8",
  ).toString("base64url");
}

export function decodeProjectCursor(
  raw: string | undefined,
  fingerprint: string,
  files: number,
  key: Buffer,
): ProjectCursor | undefined {
  if (raw === undefined) return undefined;
  if (raw.length > 4096) throw new WorkspaceError("cursor_invalid", "Search cursor exceeds its bound.");
  let cursor: ProjectCursor;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.keys(value).every((field) =>
        ["version", "fingerprint", "index", "offsetBytes", "matchIndex", "fileSha256", "seal"].includes(field),
      ) ||
      typeof value.seal !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.seal)
    )
      throw new Error("invalid cursor envelope");
    const { seal, ...position } = value;
    cursor = position as ProjectCursor;
    if (!timingSafeEqual(Buffer.from(seal, "hex"), cursorSeal(cursor, key))) throw new Error("changed cursor position");
  } catch {
    throw new WorkspaceError("cursor_invalid", "Search cursor identity is invalid or expired.");
  }
  if (
    cursor.version !== 1 ||
    cursor.fingerprint !== fingerprint ||
    !Number.isSafeInteger(cursor.index) ||
    cursor.index < 0 ||
    cursor.index >= files ||
    !Number.isSafeInteger(cursor.offsetBytes) ||
    cursor.offsetBytes < 0 ||
    (cursor.matchIndex !== undefined && (!Number.isSafeInteger(cursor.matchIndex) || cursor.matchIndex < 0)) ||
    (cursor.fileSha256 !== undefined && !/^[a-f0-9]{64}$/.test(cursor.fileSha256)) ||
    (cursor.matchIndex !== undefined && !cursor.fileSha256) ||
    (!cursor.fileSha256 && cursor.offsetBytes !== 0)
  )
    throw new WorkspaceError("cursor_invalid", "Search cursor no longer matches this project observation.");
  return cursor;
}
