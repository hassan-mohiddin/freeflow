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

export async function hashDirectory(root) {
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

  await visit(absoluteRoot);
  return sha256(stableJson(entries));
}

export function hashGitPath(repoRoot, revision, path) {
  const result = spawnSync("git", ["ls-tree", "-r", "--full-tree", revision, "--", path], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Unable to resolve git variant ${revision}:${path}: ${result.stderr.trim()}`);
  }
  if (!result.stdout.trim()) throw new Error(`Git variant path is empty: ${revision}:${path}`);
  return sha256(result.stdout);
}
