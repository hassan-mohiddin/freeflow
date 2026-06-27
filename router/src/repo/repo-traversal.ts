import { readdir, realpath, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

export interface RepoTextFileRef {
  path: string;
  absolutePath: string;
  sizeBytes: number;
}

export interface ResolvedRepoPath {
  root: string;
  absolutePath: string;
  relativePath: string;
}

export interface CollectRepoTextFileRefsOptions {
  root: string;
  requestedPath?: string;
  generatedPathGlobs?: readonly string[];
}

const BROAD_SCAN_MAX_FILE_BYTES = 1024 * 1024;

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  "coverage",
  "target",
  "graphify-out",
  ".cache",
  ".tmp",
  "tmp",
  "temp",
  "logs",
  "generated",
]);

const BROAD_SKIP_FILE_EXTENSIONS = new Set([
  ".7z",
  ".avi",
  ".bin",
  ".bmp",
  ".br",
  ".class",
  ".db",
  ".dll",
  ".dylib",
  ".eot",
  ".exe",
  ".gif",
  ".gz",
  ".heic",
  ".icns",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".otf",
  ".parquet",
  ".pdf",
  ".png",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tgz",
  ".ttf",
  ".wasm",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
  ".zst",
]);

export async function collectRepoTextFileRefs(options: CollectRepoTextFileRefsOptions): Promise<RepoTextFileRef[]> {
  const start = await resolveRepoPath(options.root, options.requestedPath);
  const fileRefs: RepoTextFileRef[] = [];
  const visitedDirectories = new Set<string>();
  const broadTraversal = !isExplicitRequestedPath(start.relativePath);
  await collectTextFileRefs({
    root: start.root,
    currentPath: start.absolutePath,
    fileRefs,
    broadTraversal,
    visitedDirectories,
    generatedPathGlobs: options.generatedPathGlobs ?? [],
  });
  return fileRefs;
}

export async function resolveRepoPath(root: string, requestedPath?: string): Promise<ResolvedRepoPath> {
  const rootRealPath = await realpath(resolve(root));
  const requestedAbsolutePath = requestedPath ? resolve(rootRealPath, requestedPath) : rootRealPath;
  const requestedRealPath = await realpath(requestedAbsolutePath);

  if (!isPathInsideRoot(rootRealPath, requestedRealPath)) {
    throw new Error(`Repo path escapes root: ${requestedPath ?? "."}`);
  }

  return {
    root: rootRealPath,
    absolutePath: requestedRealPath,
    relativePath: normalizeRelativePath(relative(rootRealPath, requestedRealPath)),
  };
}

interface CollectTextFileRefsOptions {
  root: string;
  currentPath: string;
  fileRefs: RepoTextFileRef[];
  broadTraversal: boolean;
  visitedDirectories: Set<string>;
  generatedPathGlobs: readonly string[];
}

async function collectTextFileRefs(options: CollectTextFileRefsOptions): Promise<void> {
  let currentRealPath: string;
  try {
    currentRealPath = await realpath(options.currentPath);
  } catch {
    return;
  }
  if (!isPathInsideRoot(options.root, currentRealPath)) {
    return;
  }

  let currentStat: Awaited<ReturnType<typeof stat>>;
  try {
    currentStat = await stat(currentRealPath);
  } catch {
    return;
  }
  const path = normalizeRelativePath(relative(options.root, currentRealPath));

  if (currentStat.isDirectory()) {
    if (options.visitedDirectories.has(currentRealPath)) {
      return;
    }
    options.visitedDirectories.add(currentRealPath);

    if (options.broadTraversal && path !== "" && shouldSkipBroadDirectory(path, options.generatedPathGlobs)) {
      return;
    }

    const entries = await readdir(currentRealPath, { withFileTypes: true });
    for (const entry of entries) {
      await collectTextFileRefs({
        ...options,
        currentPath: resolve(currentRealPath, entry.name),
      });
    }
    return;
  }

  if (!currentStat.isFile()) {
    return;
  }

  if (options.broadTraversal && shouldSkipBroadFile(path, currentStat.size, options.generatedPathGlobs)) {
    return;
  }

  options.fileRefs.push({ path, absolutePath: currentRealPath, sizeBytes: currentStat.size });
}

function isExplicitRequestedPath(requestedRelativePath: string): boolean {
  return requestedRelativePath !== "" && requestedRelativePath !== ".";
}

function shouldSkipBroadDirectory(path: string, generatedPathGlobs: readonly string[]): boolean {
  const name = path.split("/").at(-1) ?? path;
  return SKIP_DIRS.has(name) || matchesGeneratedPathHint(path, generatedPathGlobs);
}

function shouldSkipBroadFile(path: string, size: number, generatedPathGlobs: readonly string[]): boolean {
  if (matchesGeneratedPathHint(path, generatedPathGlobs)) {
    return true;
  }

  const name = path.split("/").at(-1)?.toLowerCase() ?? path.toLowerCase();
  if (isLockfile(name)) {
    return false;
  }

  if (hasBroadSkippedFileExtension(name)) {
    return true;
  }

  if (size > BROAD_SCAN_MAX_FILE_BYTES) {
    return true;
  }

  if (name.endsWith(".min.js") || name.endsWith(".min.css") || name.endsWith(".map")) {
    return true;
  }

  if (name.includes(".bundle.") || name.endsWith(".log")) {
    return true;
  }

  if ((name.endsWith(".html") || name.endsWith(".json")) && size > 64_000) {
    return true;
  }

  return false;
}

function matchesGeneratedPathHint(path: string, hints: readonly string[]): boolean {
  if (hints.length === 0) {
    return false;
  }

  const normalizedPath = normalizeRelativePath(path);
  return hints.some((hint) => matchesGeneratedPathGlob(normalizedPath, hint));
}

export function matchesGeneratedPathGlob(path: string, pattern: string): boolean {
  const normalizedPath = normalizeRelativePath(path).replace(/\/+$/, "");
  const normalizedPattern = normalizeRelativePath(pattern).replace(/\/+$/, "");
  if (!normalizedPath || !normalizedPattern || hasUnsupportedGlobSyntax(normalizedPattern)) {
    return false;
  }

  const patternSegments = normalizedPattern.split("/");
  const pathSegments = normalizedPath.split("/");
  if (patternSegments.some((segment) => segment.includes("**") && segment !== "**")) {
    return false;
  }

  return matchGlobSegments(patternSegments, pathSegments, 0, 0);
}

function matchGlobSegments(
  patternSegments: readonly string[],
  pathSegments: readonly string[],
  patternIndex: number,
  pathIndex: number,
): boolean {
  if (patternIndex === patternSegments.length) {
    return pathIndex === pathSegments.length;
  }

  const patternSegment = patternSegments[patternIndex];
  if (patternSegment === "**") {
    if (patternIndex === patternSegments.length - 1) {
      return true;
    }

    for (let nextPathIndex = pathIndex; nextPathIndex <= pathSegments.length; nextPathIndex += 1) {
      if (matchGlobSegments(patternSegments, pathSegments, patternIndex + 1, nextPathIndex)) {
        return true;
      }
    }
    return false;
  }

  const pathSegment = pathSegments[pathIndex];
  if (pathSegment === undefined || patternSegment === undefined || !matchesGlobSegment(pathSegment, patternSegment)) {
    return false;
  }

  return matchGlobSegments(patternSegments, pathSegments, patternIndex + 1, pathIndex + 1);
}

function matchesGlobSegment(pathSegment: string, patternSegment: string): boolean {
  const escaped = patternSegment
    .split("*")
    .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${escaped}$`).test(pathSegment);
}

function hasUnsupportedGlobSyntax(pattern: string): boolean {
  return /[{}!?[\]\\]/.test(pattern);
}

function hasBroadSkippedFileExtension(name: string): boolean {
  for (const extension of BROAD_SKIP_FILE_EXTENSIONS) {
    if (name.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function isLockfile(name: string): boolean {
  return (
    name === "package-lock.json" ||
    name === "npm-shrinkwrap.json" ||
    name === "pnpm-lock.yaml" ||
    name === "yarn.lock" ||
    name === "bun.lockb"
  );
}

function isPathInsideRoot(root: string, absolutePath: string): boolean {
  const relativePath = relative(root, absolutePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !/^[A-Za-z]:/.test(relativePath));
}

function normalizeRelativePath(path: string): string {
  return path.split(/[\\/]+/).join("/");
}
