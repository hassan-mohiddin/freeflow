import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function hashFile(path) {
  return sha256(await readFile(path));
}

async function filesystemEntries(root, paths) {
  const absoluteRoot = resolve(root);
  const entries = [];

  async function visit(path) {
    const info = await lstat(path);
    const rel = relative(absoluteRoot, path) || ".";
    if (info.isSymbolicLink()) {
      entries.push([rel, "symlink", await readlink(path)]);
      return;
    }
    if (info.isDirectory()) {
      const names = (await readdir(path)).sort();
      for (const name of names) await visit(resolve(path, name));
      return;
    }
    if (info.isFile()) entries.push([rel, "file", sha256(await readFile(path))]);
  }

  for (const path of paths) await visit(resolve(absoluteRoot, path));
  return entries.sort((left, right) => left[0].localeCompare(right[0]));
}

export async function hashDirectory(root) {
  return sha256(stableJson(await filesystemEntries(root, ["."])));
}

export async function hashDeclaredResources(root, resources) {
  return sha256(stableJson(await filesystemEntries(root, [...resources].sort())));
}

export function hashGitResources(repoRoot, revision, rootPath, resources) {
  const root = rootPath.replace(/\/$/, "");
  const entries = [];
  for (const resource of [...resources].sort()) {
    const fullResource = `${root}/${resource}`;
    const result = spawnSync("git", ["ls-tree", "-r", "-z", "--full-tree", revision, "--", fullResource], { cwd: repoRoot, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`Unable to resolve git resource ${revision}:${fullResource}: ${result.stderr.trim()}`);
    const records = result.stdout.split("\0").filter(Boolean);
    if (records.length === 0) throw new Error(`Git subject resource is empty: ${revision}:${fullResource}`);
    for (const record of records) {
      const [header, fullPath] = record.split("\t");
      const [mode, type] = header.split(" ");
      if (type !== "blob" || mode === "120000") throw new Error(`Unsupported git subject resource: ${mode} ${type} ${fullPath}`);
      if (fullPath !== fullResource && !fullPath.startsWith(`${fullResource}/`)) throw new Error(`Git subject resource escapes declaration: ${fullPath}`);
      const content = spawnSync("git", ["show", `${revision}:${fullPath}`], { cwd: repoRoot, encoding: null, maxBuffer: 16 * 1024 * 1024 });
      if (content.status !== 0) throw new Error(`Unable to read git subject resource: ${revision}:${fullPath}`);
      entries.push([fullPath.slice(root.length + 1), "file", sha256(content.stdout)]);
    }
  }
  entries.sort((left, right) => left[0].localeCompare(right[0]));
  return sha256(stableJson(entries));
}
