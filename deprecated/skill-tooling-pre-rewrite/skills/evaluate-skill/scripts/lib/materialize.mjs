import { spawnSync } from "node:child_process";
import { chmod, cp, lstat, mkdir, readFile, readdir, readlink, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { sha256, stableJson } from "./hash.mjs";
import { assertNoSymlinkTree } from "./path-policy.mjs";

function runGit(repoRoot, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${String(result.stderr).trim()}`);
  return result.stdout;
}

export async function copyDirectory(source, destination) {
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true, force: true, preserveTimestamps: true });
}

export async function materializeSkillVariant(repoRoot, variant, destination) {
  const resources = variant.resources ?? ["SKILL.md"];
  await mkdir(destination, { recursive: true });
  if (variant.kind === "working-tree") {
    const sourceRoot = resolve(repoRoot, variant.path);
    for (const resource of resources) {
      const source = resolve(sourceRoot, resource);
      const rel = relative(sourceRoot, source);
      if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`Subject resource escapes variant: ${resource}`);
      const info = await lstat(source);
      if (info.isSymbolicLink()) throw new Error(`Subject resources cannot be symlinks: ${resource}`);
      await assertNoSymlinkTree(source, `Subject resource ${resource}`);
      const target = resolve(destination, resource);
      await mkdir(dirname(target), { recursive: true });
      await cp(source, target, { recursive: info.isDirectory(), force: true, preserveTimestamps: true });
    }
  } else if (variant.kind === "git") {
    const root = variant.path.replace(/\/$/, "") === "." ? "" : variant.path.replace(/\/$/, "");
    const prefix = root ? `${root}/` : "";
    for (const resource of resources) {
      const fullResource = root ? `${root}/${resource}` : resource;
      const raw = runGit(repoRoot, ["ls-tree", "-r", "-z", "--full-tree", variant.revision, "--", fullResource], {
        encoding: "buffer",
      });
      const records = Buffer.from(raw).toString("utf8").split("\0").filter(Boolean);
      if (records.length === 0) throw new Error(`Missing git subject resource: ${variant.revision}:${fullResource}`);
      for (const record of records) {
        const [header, fullPath] = record.split("\t");
        const [mode, type] = header.split(" ");
        if (type !== "blob" || mode === "120000")
          throw new Error(`Unsupported git subject resource: ${mode} ${type} ${fullPath}`);
        if (prefix && !fullPath.startsWith(prefix)) throw new Error(`Unexpected git path outside variant: ${fullPath}`);
        const relativePath = prefix ? fullPath.slice(prefix.length) : fullPath;
        const target = resolve(destination, relativePath);
        await mkdir(dirname(target), { recursive: true });
        const content = spawnSync("git", ["show", `${variant.revision}:${fullPath}`], {
          cwd: repoRoot,
          encoding: null,
          maxBuffer: 16 * 1024 * 1024,
        });
        if (content.status !== 0) throw new Error(`Unable to extract ${variant.revision}:${fullPath}`);
        await writeFile(target, content.stdout);
        await chmod(target, mode.endsWith("755") ? 0o755 : 0o644);
      }
    }
  } else {
    throw new Error(`Cannot materialize variant kind: ${variant.kind}`);
  }
  await makeReadOnly(destination);
}

export async function materializeCompositionVariant(repoRoot, composition, targetVariant, destination) {
  await mkdir(destination, { recursive: true });
  const skillSnapshots = [];
  for (const component of [...composition.base_stack, { ...targetVariant, name: composition.target_name }]) {
    const path = resolve(destination, "skills", component.name);
    await materializeSkillVariant(repoRoot, component, path);
    skillSnapshots.push({ name: component.name, path, resources: component.resources });
  }

  let runtime = null;
  if (composition.runtime) {
    const path = resolve(destination, "runtime");
    await materializeSkillVariant(repoRoot, composition.runtime, path);
    runtime = {
      profile: composition.runtime.profile,
      path,
      resources: composition.runtime.resources,
      interaction_contract: composition.runtime.interaction_contract,
      workflow: composition.runtime.workflow,
    };
  }

  await makeReadOnly(destination);
  return { skill_snapshots: skillSnapshots, runtime };
}

export async function makeReadOnly(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`Skill snapshots cannot contain symlinks: ${path}`);
  if (info.isDirectory()) {
    for (const name of await readdir(path)) await makeReadOnly(resolve(path, name));
    await chmod(path, 0o555);
    return;
  }
  if (info.isFile()) await chmod(path, info.mode & 0o111 ? 0o555 : 0o444);
}

export async function initializeFixtureGit(workspace) {
  runGit(workspace, ["init", "--quiet"]);
  runGit(workspace, ["add", "--all"]);
  runGit(workspace, [
    "-c",
    "user.name=Freeflow Eval",
    "-c",
    "user.email=eval@invalid",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "fixture",
  ]);
}

export async function captureGitEvidence(workspace) {
  runGit(workspace, ["add", "--intent-to-add", "--all"]);
  const status = runGit(workspace, ["status", "--short", "--untracked-files=all"]);
  const diff = runGit(workspace, ["diff", "--binary", "--no-ext-diff", "HEAD"]);
  const changedPaths = status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^.* -> /, ""))
    .sort();
  return { status, diff, changedPaths };
}

export function captureGitEvidenceNonMutating(workspace) {
  const status = runGit(workspace, ["status", "--short", "--untracked-files=all"]);
  const changedPaths = status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^.* -> /, ""))
    .sort();
  const trackedDiff = runGit(workspace, ["diff", "--binary", "--no-ext-diff", "HEAD"]);
  const untrackedDiffs = [];
  for (const line of status.split("\n").filter((item) => item.startsWith("?? "))) {
    const path = line.slice(3);
    const result = spawnSync("git", ["diff", "--no-index", "--binary", "--no-ext-diff", "--", "/dev/null", path], {
      cwd: workspace,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0 && result.status !== 1)
      throw new Error(`Unable to capture untracked diff for ${path}: ${String(result.stderr).trim()}`);
    if (result.stdout) untrackedDiffs.push(result.stdout);
  }
  return { status, diff: [trackedDiff, ...untrackedDiffs].filter(Boolean).join("\n"), changedPaths };
}

export async function createManifest(root, { exclude = [] } = {}) {
  const files = {};
  const excluded = new Set(exclude);
  async function visit(path) {
    const info = await lstat(path);
    const rel = relative(root, path).split(sep).join("/");
    if (rel === ".git" || rel.startsWith(".git/") || excluded.has(rel)) return;
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
    await chmod(path, entry.mode & 0o111 ? 0o755 : 0o644);
  }
}

export async function removeWritableTree(path) {
  try {
    const info = await stat(path);
    if (info.isDirectory()) await makeWritable(path);
  } catch {}
  await rm(path, { recursive: true, force: true });
}
