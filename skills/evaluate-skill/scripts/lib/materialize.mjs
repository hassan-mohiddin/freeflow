import { spawnSync } from "node:child_process";
import { chmod, cp, lstat, mkdir, readFile, readdir, readlink, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { sha256, stableJson } from "./hash.mjs";

function runGit(repoRoot, args, options = {}) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: options.encoding ?? "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${String(result.stderr).trim()}`);
  return result.stdout;
}

export async function copyDirectory(source, destination) {
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true, preserveTimestamps: true });
}

export async function materializeSkillVariant(repoRoot, variant, destination) {
  if (variant.kind === "working-tree") {
    await copyDirectory(resolve(repoRoot, variant.path), destination);
  } else if (variant.kind === "git") {
    await mkdir(destination, { recursive: true });
    const raw = runGit(repoRoot, ["ls-tree", "-r", "-z", "--full-tree", variant.revision, "--", variant.path], { encoding: "buffer" });
    const records = Buffer.from(raw).toString("utf8").split("\0").filter(Boolean);
    for (const record of records) {
      const [header, fullPath] = record.split("\t");
      const [mode, type] = header.split(" ");
      if (type !== "blob") continue;
      const prefix = `${variant.path.replace(/\/$/, "")}/`;
      if (!fullPath.startsWith(prefix)) throw new Error(`Unexpected git path outside variant: ${fullPath}`);
      const relativePath = fullPath.slice(prefix.length);
      const target = resolve(destination, relativePath);
      await mkdir(dirname(target), { recursive: true });
      const content = spawnSync("git", ["show", `${variant.revision}:${fullPath}`], { cwd: repoRoot, encoding: null, maxBuffer: 16 * 1024 * 1024 });
      if (content.status !== 0) throw new Error(`Unable to extract ${variant.revision}:${fullPath}`);
      await writeFile(target, content.stdout);
      await chmod(target, mode.endsWith("755") ? 0o755 : 0o644);
    }
  } else {
    throw new Error(`Cannot materialize variant kind: ${variant.kind}`);
  }
  await makeReadOnly(destination);
}

export async function makeReadOnly(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`Skill snapshots cannot contain symlinks: ${path}`);
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await makeReadOnly(resolve(path, name));
    await chmod(path, 0o555);
    return;
  }
  if (info.isFile()) await chmod(path, (info.mode & 0o111) ? 0o555 : 0o444);
}

export async function initializeFixtureGit(workspace) {
  runGit(workspace, ["init", "--quiet"]);
  runGit(workspace, ["add", "--all"]);
  runGit(workspace, ["-c", "user.name=Freeflow Eval", "-c", "user.email=eval@invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture"]);
}

export async function captureGitEvidence(workspace) {
  runGit(workspace, ["add", "--intent-to-add", "--all"]);
  const status = runGit(workspace, ["status", "--short", "--untracked-files=all"]);
  const diff = runGit(workspace, ["diff", "--binary", "--no-ext-diff", "HEAD"]);
  const changedPaths = status.split("\n").filter(Boolean).map((line) => line.slice(3).replace(/^.* -> /, "")).sort();
  return { status, diff, changedPaths };
}

export async function createManifest(root) {
  const files = {};
  async function visit(path) {
    const info = await lstat(path);
    const rel = relative(root, path).split(sep).join("/");
    if (rel === ".git" || rel.startsWith(".git/")) return;
    if (info.isSymbolicLink()) {
      files[rel] = { type: "symlink", target: await readlink(path) };
      return;
    }
    if (info.isDirectory()) {
      for (const name of (await readdir(path)).sort()) await visit(resolve(path, name));
      return;
    }
    if (info.isFile()) {
      const content = await readFile(path);
      files[rel] = {
        type: "file",
        size: info.size,
        sha256: sha256(content),
        lines: content.toString("utf8").split("\n").length,
      };
    }
  }
  await visit(root);
  return { files, fingerprint: sha256(stableJson(files)) };
}

export async function makeWritable(path) {
  const entry = await lstat(path);
  if (entry.isDirectory()) {
    await chmod(path, 0o755);
    for (const name of await readdir(path)) await makeWritable(resolve(path, name));
  } else if (!entry.isSymbolicLink()) {
    await chmod(path, (entry.mode & 0o111) ? 0o755 : 0o644);
  }
}

export async function removeWritableTree(path) {
  try {
    const info = await stat(path);
    if (info.isDirectory()) await makeWritable(path);
  } catch {}
  await rm(path, { recursive: true, force: true });
}
