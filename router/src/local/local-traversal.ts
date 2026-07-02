import { realpath, readdir, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, parse, relative, resolve } from "node:path";

import { matchesGeneratedPathGlob } from "../repo/repo-traversal.js";

export interface LocalTextFileRef {
  root: string;
  path: string;
  absolutePath: string;
  sizeBytes: number;
}

export interface ResolvedLocalPath {
  root: string;
  absolutePath: string;
  relativePath: string;
}

export interface CollectLocalTextFileRefsOptions {
  root: string;
  requestedPath?: string;
  generatedPathGlobs?: readonly string[];
}

interface LocalTraversalBudget {
  directories: number;
  files: number;
  bytes: number;
}

const BROAD_SCAN_MAX_FILE_BYTES = 1024 * 1024;
const LOCAL_SCAN_MAX_DIRECTORIES = 2_000;
const LOCAL_SCAN_MAX_FILES = 10_000;
const LOCAL_SCAN_MAX_TOTAL_BYTES = 64 * 1024 * 1024;

const BROAD_SKIP_DIRS = new Set([
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

const SECRET_DIRS = new Set([
  ".aws",
  ".azure",
  ".docker",
  ".gnupg",
  ".kube",
  ".password-store",
  ".ssh",
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

const SECRET_FILE_NAMES = new Set([
  ".env",
  ".netrc",
  ".npmrc",
  ".pypirc",
  "authorized_keys",
  "credentials",
  "credentials.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "known_hosts",
]);

export async function collectLocalTextFileRefs(options: CollectLocalTextFileRefsOptions): Promise<LocalTextFileRef[]> {
  const root = await resolveLocalRoot(options.root);
  const start = await resolveLocalRequestedPath(root, options.requestedPath);
  const fileRefs: LocalTextFileRef[] = [];
  const visitedDirectories = new Set<string>();
  const broadTraversal = !isExplicitRequestedPath(start.relativePath);
  const budget: LocalTraversalBudget = { directories: 0, files: 0, bytes: 0 };
  await collectTextFileRefs({
    root,
    currentPath: start.absolutePath,
    fileRefs,
    broadTraversal,
    visitedDirectories,
    generatedPathGlobs: options.generatedPathGlobs ?? [],
    budget,
  });
  return fileRefs;
}

export async function resolveLocalPath(root: string, requestedPath?: string): Promise<ResolvedLocalPath> {
  const rootRealPath = await resolveLocalRoot(root);
  return resolveLocalRequestedPath(rootRealPath, requestedPath);
}

async function resolveLocalRoot(root: string): Promise<string> {
  if (typeof root !== "string" || root.trim().length === 0) {
    throw new Error("Local source.root must be a non-empty absolute path.");
  }
  if (!isAbsolute(root)) {
    throw new Error(`Local source.root must be an absolute path: ${root}`);
  }

  const rootRealPath = await realpath(resolve(root));
  const rootStat = await stat(rootRealPath);
  if (!rootStat.isDirectory()) {
    throw new Error(`Local source.root must be a directory: ${root}`);
  }

  const broadRootReason = broadRootRejectionReason(rootRealPath);
  if (broadRootReason) {
    throw new Error(`Local source.root is too broad: ${rootRealPath}. ${broadRootReason} Choose a narrower explicit docs/source directory.`);
  }

  return rootRealPath;
}

async function resolveLocalRequestedPath(rootRealPath: string, requestedPath?: string): Promise<ResolvedLocalPath> {
  if (requestedPath !== undefined && requestedPath !== "" && isAbsolute(requestedPath)) {
    throw new Error(`Local source.path must be relative to source.root: ${requestedPath}`);
  }

  const requestedAbsolutePath = requestedPath && requestedPath !== "" ? resolve(rootRealPath, requestedPath) : rootRealPath;
  const requestedRealPath = await realpath(requestedAbsolutePath);

  if (!isPathInsideRoot(rootRealPath, requestedRealPath)) {
    throw new Error(`Local path escapes root: ${requestedPath ?? "."}`);
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
  fileRefs: LocalTextFileRef[];
  broadTraversal: boolean;
  visitedDirectories: Set<string>;
  generatedPathGlobs: readonly string[];
  budget: LocalTraversalBudget;
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

  if (isSensitivePath(path)) {
    return;
  }

  if (currentStat.isDirectory()) {
    if (options.visitedDirectories.has(currentRealPath)) {
      return;
    }
    options.visitedDirectories.add(currentRealPath);
    noteDirectory(options.budget);

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

  noteFile(options.budget, currentStat.size);

  if (options.broadTraversal && shouldSkipBroadFile(path, currentStat.size, options.generatedPathGlobs)) {
    return;
  }

  options.fileRefs.push({ root: options.root, path, absolutePath: currentRealPath, sizeBytes: currentStat.size });
}

function noteDirectory(budget: LocalTraversalBudget) {
  budget.directories += 1;
  if (budget.directories > LOCAL_SCAN_MAX_DIRECTORIES) {
    throw new Error(`Local broad scan exceeded directory budget (${LOCAL_SCAN_MAX_DIRECTORIES}); narrow source.root or source.path.`);
  }
}

function noteFile(budget: LocalTraversalBudget, size: number) {
  budget.files += 1;
  budget.bytes += size;
  if (budget.files > LOCAL_SCAN_MAX_FILES) {
    throw new Error(`Local broad scan exceeded file budget (${LOCAL_SCAN_MAX_FILES}); narrow source.root or source.path.`);
  }
  if (budget.bytes > LOCAL_SCAN_MAX_TOTAL_BYTES) {
    throw new Error(`Local broad scan exceeded byte budget (${LOCAL_SCAN_MAX_TOTAL_BYTES}); narrow source.root or source.path.`);
  }
}

function isExplicitRequestedPath(requestedRelativePath: string): boolean {
  return requestedRelativePath !== "" && requestedRelativePath !== ".";
}

function shouldSkipBroadDirectory(path: string, generatedPathGlobs: readonly string[]): boolean {
  const name = path.split("/").at(-1)?.toLowerCase() ?? path.toLowerCase();
  return BROAD_SKIP_DIRS.has(name) || matchesGeneratedPathHint(path, generatedPathGlobs);
}

function shouldSkipBroadFile(path: string, size: number, generatedPathGlobs: readonly string[]): boolean {
  if (matchesGeneratedPathHint(path, generatedPathGlobs)) {
    return true;
  }

  const name = path.split("/").at(-1)?.toLowerCase() ?? path.toLowerCase();
  if (hasSecretFileName(name)) {
    return true;
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

function isSensitivePath(path: string): boolean {
  if (!path || path === ".") {
    return false;
  }
  const segments = normalizeRelativePath(path).split("/").map((segment) => segment.toLowerCase());
  return segments.some((segment) => SECRET_DIRS.has(segment)) || hasSecretFileName(segments.at(-1) ?? "");
}

function hasSecretFileName(name: string): boolean {
  return SECRET_FILE_NAMES.has(name) || name.startsWith(".env.") || name.endsWith(".pem") || name.endsWith(".key") || name.endsWith(".p12") || name.endsWith(".pfx");
}

function hasBroadSkippedFileExtension(name: string): boolean {
  for (const extension of BROAD_SKIP_FILE_EXTENSIONS) {
    if (name.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function broadRootRejectionReason(rootRealPath: string): string | null {
  const normalized = normalizeAbsolutePath(rootRealPath);
  const filesystemRoot = normalizeAbsolutePath(parse(rootRealPath).root);
  if (normalized === filesystemRoot) {
    return "Filesystem root scans are not allowed.";
  }

  const home = safeNormalizeAbsolutePath(homedir());
  if (home && normalized === home) {
    return "Home directory scans are not allowed.";
  }

  const temp = safeNormalizeAbsolutePath(tmpdir());
  if (temp && normalized === temp) {
    return "System temp directory scans are not allowed.";
  }

  const broadRoots = [
    "/Applications",
    "/Library",
    "/System",
    "/Users",
    "/bin",
    "/etc",
    "/home",
    "/opt",
    "/private/tmp",
    "/sbin",
    "/tmp",
    "/usr",
    "/var",
  ].map(normalizeAbsolutePath);
  if (broadRoots.includes(normalized)) {
    return "System or multi-user root scans are not allowed.";
  }

  if (SECRET_DIRS.has(basename(normalized).toLowerCase())) {
    return "Credential/secret directory roots are not allowed.";
  }

  return null;
}

function safeNormalizeAbsolutePath(path: string): string | null {
  try {
    return normalizeAbsolutePath(path);
  } catch {
    return null;
  }
}

function isPathInsideRoot(root: string, absolutePath: string): boolean {
  const relativePath = relative(root, absolutePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !/^[A-Za-z]:/.test(relativePath));
}

function normalizeRelativePath(path: string): string {
  return path.split(/[\\/]+/).join("/");
}

function normalizeAbsolutePath(path: string): string {
  return normalizeRelativePath(resolve(path)).replace(/\/+$/, "") || "/";
}
