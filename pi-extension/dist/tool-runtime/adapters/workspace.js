import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
export const MAX_WORKSPACE_TEXT_BYTES = 4 * 1024 * 1024;
export class WorkspaceError extends Error {
  code;
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "WorkspaceError";
  }
}
export function insideWorkspace(root, path) {
  const location = relative(root, path);
  return location === "" || (!location.startsWith("..") && !isAbsolute(location));
}
export function workspaceDenied(path, denyPaths) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  return denyPaths.some((deny) => {
    const prefix = deny.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
    return prefix.length > 0 && (normalized === prefix || normalized.startsWith(`${prefix}/`));
  });
}
export async function resolveWorkspaceRoot(state, scope) {
  if (!state?.effective || !state.workspace.effective)
    throw new WorkspaceError("workspace_disabled", "Workspace operations are disabled.");
  const configuredRoot = state.workspace.root
    ? isAbsolute(state.workspace.root)
      ? state.workspace.root
      : resolve(scope.cwd, state.workspace.root)
    : scope.cwd;
  const root = await realpath(configuredRoot).catch(() => {
    throw new WorkspaceError("workspace_unavailable", "Configured workspace root is unavailable.");
  });
  return { root, denyPaths: Object.freeze([".git", ...state.workspace.denyPaths]) };
}
export async function resolveWorkspaceFile(state, scope, requestedPath) {
  if (!requestedPath || requestedPath.includes("\0") || isAbsolute(requestedPath))
    throw new WorkspaceError("path_invalid", "Workspace path must be relative.");
  const { root, denyPaths } = await resolveWorkspaceRoot(state, scope);
  const lexical = resolve(root, requestedPath);
  if (!insideWorkspace(root, lexical))
    throw new WorkspaceError("path_outside_root", "Workspace path escapes the configured root.");
  const path = await realpath(lexical).catch(() => {
    throw new WorkspaceError("path_unavailable", "Workspace path is unavailable.");
  });
  if (!insideWorkspace(root, path))
    throw new WorkspaceError("path_outside_root", "Workspace path resolves outside the root.");
  const requestedRelative = relative(root, lexical);
  const canonicalRelative = relative(root, path);
  if (workspaceDenied(requestedRelative, denyPaths) || workspaceDenied(canonicalRelative, denyPaths))
    throw new WorkspaceError("path_denied", "Workspace path is denied by policy.");
  const value = await lstat(path).catch(() => {
    throw new WorkspaceError("path_unavailable", "Workspace path is unavailable.");
  });
  if (!value.isFile()) throw new WorkspaceError("path_unsupported", "Workspace path is not a regular file.");
  return { root, path, relativePath: canonicalRelative.replaceAll("\\", "/") };
}
function signature(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}
export async function readWorkspaceSnapshot(path, signal) {
  if (signal?.aborted) throw new WorkspaceError("cancelled", "Workspace read was cancelled.");
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let file;
  try {
    file = await open(path, constants.O_RDONLY | noFollow);
    const before = await file.stat();
    if (!before.isFile()) throw new WorkspaceError("path_unsupported", "Workspace path is not a regular file.");
    if (before.size > MAX_WORKSPACE_TEXT_BYTES)
      throw new WorkspaceError("file_too_large", "Workspace file exceeds the supported 4 MiB limit.");
    const body = await file.readFile();
    const after = await file.stat();
    if (signature(before) !== signature(after) || body.length !== before.size)
      throw new WorkspaceError("source_changed", "Workspace file changed during observation.");
    if (signal?.aborted) throw new WorkspaceError("cancelled", "Workspace read was cancelled.");
    return body;
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    throw new WorkspaceError("read_failed", "Workspace file could not be read.");
  } finally {
    await file?.close();
  }
}
export class WorkspaceCoordinator {
  tails = new Map();
  async exclusive(path, action) {
    const prior = this.tails.get(path) ?? Promise.resolve();
    const result = prior.then(action, action);
    const tail = result.then(
      () => {},
      () => {},
    );
    this.tails.set(path, tail);
    try {
      return await result;
    } finally {
      if (this.tails.get(path) === tail) this.tails.delete(path);
    }
  }
}
