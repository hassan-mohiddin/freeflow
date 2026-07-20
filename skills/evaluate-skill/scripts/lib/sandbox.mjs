import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  cp,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export async function prepareFixture({ declaredPath, root, groupDirectory }) {
  if (declaredPath === null) return null;

  const canonicalRoot = await realpath(root);
  const sourcePath = await realpath(path.resolve(root, declaredPath)).catch(() => null);
  if (sourcePath === null || !isContained(canonicalRoot, sourcePath)) {
    throw new Error(`declared fixture is missing or escapes the definition root: ${declaredPath}`);
  }
  const sourceStat = await lstat(sourcePath);
  if (!sourceStat.isDirectory()) throw new Error(`declared fixture is not a directory: ${declaredPath}`);

  const files = await fingerprintDirectory(sourcePath);
  const snapshotPath = path.join(groupDirectory, "resources", "fixture");
  await mkdir(path.dirname(snapshotPath), { recursive: true });
  await cp(sourcePath, snapshotPath, { recursive: true, dereference: false, errorOnExist: true, force: false });
  const snapshotFiles = await fingerprintDirectory(await realpath(snapshotPath));
  const sourceFilesAfter = await fingerprintDirectory(sourcePath);
  if (
    JSON.stringify(snapshotFiles) !== JSON.stringify(files) ||
    JSON.stringify(sourceFilesAfter) !== JSON.stringify(files)
  ) {
    throw new Error(`declared fixture changed while it was being snapshotted: ${declaredPath}`);
  }

  return {
    declaredPath,
    sourcePath,
    snapshotPath: await realpath(snapshotPath),
    files,
  };
}

export async function materializeFixture({ fixture, workspace }) {
  if (fixture === null) {
    await mkdir(workspace, { recursive: true });
    return null;
  }

  await cp(fixture.snapshotPath, workspace, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
    force: false,
  });
  const materializedPath = await realpath(workspace);
  const materializedFiles = await fingerprintDirectory(materializedPath);
  if (JSON.stringify(materializedFiles) !== JSON.stringify(fixture.files)) {
    throw new Error(`declared fixture changed while it was being copied: ${fixture.declaredPath}`);
  }

  return { ...fixture, materializedPath };
}

export async function materializeEnvironment({ environment, root, variantDirectory }) {
  const canonicalRoot = await realpath(root);
  let source;
  let snapshotResource;
  if (environment.source.kind === "working-tree") {
    source = { kind: "working-tree", root: canonicalRoot };
    snapshotResource = (options) => snapshotWorkingTreeResource({ canonicalRoot, ...options });
  } else {
    const git = await prepareGitSource(canonicalRoot, environment.source.ref);
    source = { kind: "git", ref: environment.source.ref, commit: git.commit };
    snapshotResource = (options) => snapshotGitResource({ ...git, ...options });
  }

  const skillsRoot = path.join(variantDirectory, "resources", "skills");
  const contextRoot = path.join(variantDirectory, "resources", "context");
  await mkdir(skillsRoot, { recursive: true });
  await mkdir(contextRoot, { recursive: true });

  const skills = [];
  for (const [index, declaredPath] of environment.skills.entries()) {
    const skill = await snapshotResource({
      declaredPath,
      destination: path.join(skillsRoot, String(index)),
      requireDirectory: true,
      label: "skill",
    });
    const skillFile = await realpath(path.join(skill.path, "SKILL.md")).catch(() => null);
    if (skillFile === null || !isContained(skill.path, skillFile)) {
      throw new Error(`declared skill has no contained SKILL.md: ${declaredPath}`);
    }
    skills.push(skill);
  }

  const context = [];
  const deliveredEntries = [];
  for (const [index, declaredPath] of environment.context.entries()) {
    const entry = await snapshotResource({
      declaredPath,
      destination: path.join(contextRoot, String(index)),
      requireDirectory: false,
      label: "context",
    });
    const deliveredFiles = await contextFiles(entry.path, entry.files);
    context.push(entry);
    deliveredEntries.push({ declaredPath, files: deliveredFiles });
  }

  const manifestPath = path.join(variantDirectory, "resources", "context-delivery.json");
  const manifest = { schema_version: 1, entries: deliveredEntries };
  const manifestContents = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, manifestContents, "utf8");

  return {
    source,
    skills,
    context,
    contextDelivery:
      context.length === 0
        ? { kind: "none", manifestPath: null, sha256: null }
        : { kind: "system-prompt", manifestPath, sha256: sha256(manifestContents) },
    targetPath:
      environment.target === null ? null : await realpath(path.join(skills[environment.target].path, "SKILL.md")),
  };
}

export async function verifyEnvironment(environment) {
  for (const [label, resources] of [
    ["skill", environment.skills],
    ["context", environment.context],
  ]) {
    for (const resource of resources) {
      const current = await fingerprintDirectory(resource.path);
      if (JSON.stringify(current) !== JSON.stringify(resource.files)) {
        throw new Error(`declared ${label} changed during subject execution: ${resource.declaredPath}`);
      }
    }
  }
  if (environment.contextDelivery.kind === "system-prompt") {
    const contents = await readFile(environment.contextDelivery.manifestPath);
    if (sha256(contents) !== environment.contextDelivery.sha256) {
      throw new Error("declared context delivery manifest changed during subject execution");
    }
  }
}

export async function snapshotWorkspace({ workspace, variantDirectory, turn, before }) {
  const snapshotPath = path.join(variantDirectory, "turns", String(turn), "workspace");
  await rm(snapshotPath, { recursive: true, force: true });
  await mkdir(path.dirname(snapshotPath), { recursive: true });

  const sourceBefore = await fingerprintDirectory(workspace);
  await cp(workspace, snapshotPath, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
  const [sourceAfter, files] = await Promise.all([fingerprintDirectory(workspace), fingerprintDirectory(snapshotPath)]);
  if (
    JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter) ||
    JSON.stringify(sourceAfter) !== JSON.stringify(files)
  ) {
    throw new Error(`workspace changed while capturing turn ${turn}`);
  }
  return { path: snapshotPath, files, changes: workspaceChanges(before, files) };
}

export async function fingerprintDirectory(root) {
  const canonicalRoot = await realpath(root);
  const files = [];
  await walk(canonicalRoot, canonicalRoot, files);
  return files.sort((left, right) => comparePaths(left.path, right.path));
}

export function workspaceChanges(before, after) {
  const beforeEntries = before.filter((entry) => entry.type !== "directory");
  const afterEntries = after.filter((entry) => entry.type !== "directory");
  const beforeByPath = new Map(beforeEntries.map((file) => [file.path, file.sha256]));
  const afterByPath = new Map(afterEntries.map((file) => [file.path, file.sha256]));
  return {
    created: afterEntries.filter((file) => !beforeByPath.has(file.path)).map((file) => file.path),
    modified: afterEntries
      .filter((file) => beforeByPath.has(file.path) && beforeByPath.get(file.path) !== file.sha256)
      .map((file) => file.path),
    deleted: beforeEntries.filter((file) => !afterByPath.has(file.path)).map((file) => file.path),
  };
}

async function snapshotWorkingTreeResource({ canonicalRoot, declaredPath, destination, requireDirectory, label }) {
  const sourcePath = await realpath(path.resolve(canonicalRoot, declaredPath)).catch(() => null);
  if (sourcePath === null || !isContained(canonicalRoot, sourcePath)) {
    throw new Error(`declared ${label} is missing or escapes the definition root: ${declaredPath}`);
  }
  const sourceStat = await lstat(sourcePath);
  if (requireDirectory && !sourceStat.isDirectory()) {
    throw new Error(`declared ${label} is not a directory: ${declaredPath}`);
  }
  if (!sourceStat.isDirectory() && !sourceStat.isFile()) {
    throw new Error(`declared ${label} is not a file or directory: ${declaredPath}`);
  }

  const sourceFiles = sourceStat.isDirectory()
    ? await fingerprintDirectory(sourcePath)
    : [{ path: path.basename(sourcePath), type: "file", sha256: sha256(await readFile(sourcePath)) }];
  if (sourceStat.isDirectory()) {
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(sourcePath, destination, { recursive: true, dereference: false, errorOnExist: true, force: false });
  } else {
    await mkdir(destination, { recursive: true });
    await copyFile(sourcePath, path.join(destination, path.basename(sourcePath)));
  }
  const snapshotPath = await realpath(destination);
  const files = await fingerprintDirectory(snapshotPath);
  const sourceFilesAfter = sourceStat.isDirectory()
    ? await fingerprintDirectory(sourcePath)
    : [{ path: path.basename(sourcePath), type: "file", sha256: sha256(await readFile(sourcePath)) }];
  if (
    JSON.stringify(files) !== JSON.stringify(sourceFiles) ||
    JSON.stringify(sourceFilesAfter) !== JSON.stringify(sourceFiles)
  ) {
    throw new Error(`declared ${label} changed while it was being snapshotted: ${declaredPath}`);
  }
  return { declaredPath, sourcePath, path: snapshotPath, files };
}

async function prepareGitSource(canonicalRoot, ref) {
  const repositoryOutput = await runGit(canonicalRoot, ["rev-parse", "--show-toplevel"]);
  const repositoryRoot = await realpath(repositoryOutput.toString("utf8").trimEnd());
  if (!isContained(repositoryRoot, canonicalRoot)) {
    throw new Error("definition root is not contained by its Git repository");
  }
  const commitOutput = await runGit(canonicalRoot, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  const commit = commitOutput.toString("utf8").trim();
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error(`Git ref did not resolve to one commit: ${ref}`);
  const rootPrefix = path.relative(repositoryRoot, canonicalRoot).split(path.sep).join("/");
  return { repositoryRoot, rootPrefix, commit };
}

async function snapshotGitResource({
  repositoryRoot,
  rootPrefix,
  commit,
  declaredPath,
  destination,
  requireDirectory,
  label,
}) {
  const gitPath = [rootPrefix, declaredPath.split(path.sep).join("/")].filter(Boolean).join("/");
  const selected = await gitTreeEntries(repositoryRoot, commit, gitPath, false);
  const exact = selected.find((entry) => entry.path === gitPath);
  if (!exact) throw new Error(`declared ${label} is missing from Git commit ${commit}: ${declaredPath}`);
  if (requireDirectory && exact.type !== "tree") {
    throw new Error(`declared ${label} is not a directory in Git commit ${commit}: ${declaredPath}`);
  }
  if (exact.type !== "tree" && exact.type !== "blob") {
    throw new Error(`declared ${label} has unsupported Git type ${exact.type}: ${declaredPath}`);
  }

  await mkdir(destination, { recursive: true });
  if (exact.type === "tree") {
    const entries = await gitTreeEntries(repositoryRoot, commit, gitPath, true);
    for (const entry of entries) {
      if (entry.type !== "blob" || !entry.path.startsWith(`${gitPath}/`)) {
        throw new Error(`declared ${label} contains an unsupported Git entry: ${entry.path}`);
      }
      await materializeGitBlob(repositoryRoot, entry, entry.path.slice(gitPath.length + 1), destination);
    }
  } else {
    await materializeGitBlob(repositoryRoot, exact, path.posix.basename(gitPath), destination);
  }

  const snapshotPath = await realpath(destination);
  const files = await fingerprintDirectory(snapshotPath);
  return {
    declaredPath,
    sourcePath: `${commit}:${declaredPath}`,
    path: snapshotPath,
    files,
  };
}

async function gitTreeEntries(repositoryRoot, commit, gitPath, recursive) {
  const args = ["ls-tree", "-z"];
  if (recursive) args.push("-r");
  args.push("--full-tree", commit, "--", `:(literal)${gitPath}`);
  const output = await runGit(repositoryRoot, args);
  const entries = [];
  for (const frame of output.toString("utf8").split("\0")) {
    if (frame === "") continue;
    const separator = frame.indexOf("\t");
    const metadata = separator === -1 ? [] : frame.slice(0, separator).split(" ");
    if (metadata.length !== 3) throw new Error("Git tree output was malformed");
    entries.push({ mode: metadata[0], type: metadata[1], object: metadata[2], path: frame.slice(separator + 1) });
  }
  return entries;
}

async function materializeGitBlob(repositoryRoot, entry, relativePath, destination) {
  if (
    relativePath === "" ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Git entry escapes its declared resource: ${relativePath}`);
  }
  const outputPath = path.join(destination, ...relativePath.split("/"));
  await mkdir(path.dirname(outputPath), { recursive: true });
  const contents = await runGit(repositoryRoot, ["cat-file", "blob", entry.object]);
  if (entry.mode === "120000") {
    const target = new TextDecoder("utf-8", { fatal: true }).decode(contents);
    await symlink(target, outputPath);
    return;
  }
  if (entry.mode !== "100644" && entry.mode !== "100755") {
    throw new Error(`unsupported Git blob mode ${entry.mode}: ${entry.path}`);
  }
  await writeFile(outputPath, contents);
  if (entry.mode === "100755") await chmod(outputPath, 0o755);
}

async function runGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", cwd, ...args], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else {
        reject(
          new Error(
            `Git command failed (${signal ?? code}): ${Buffer.concat(stderr).toString("utf8").trim() || args[0]}`,
          ),
        );
      }
    });
  });
}

async function contextFiles(root, fingerprints) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const files = [];
  for (const fingerprint of fingerprints) {
    if (fingerprint.type === "directory") continue;
    const file = path.join(root, fingerprint.path);
    const resolved = await realpath(file).catch(() => null);
    const resolvedStat = resolved === null ? null : await lstat(resolved);
    if (resolved === null || !isContained(root, resolved) || !resolvedStat.isFile()) {
      throw new Error(`declared context entry is not a contained file: ${fingerprint.path}`);
    }
    const contents = await readFile(resolved);
    let text;
    try {
      text = decoder.decode(contents);
    } catch {
      throw new Error(`declared context file is not valid UTF-8 text: ${fingerprint.path}`);
    }
    files.push({ path: fingerprint.path, sha256: sha256(text), content: text });
  }
  return files;
}

async function walk(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => comparePaths(left.name, right.name));
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, entryPath);
    const entryStat = await lstat(entryPath);
    if (entryStat.isSymbolicLink()) {
      const target = await readlink(entryPath);
      const canonicalTarget = await realpath(entryPath).catch(() => null);
      if (path.isAbsolute(target) || canonicalTarget === null || !isContained(root, canonicalTarget)) {
        throw new Error(`resource symlink escapes its declared root: ${relativePath}`);
      }
      files.push({ path: relativePath, type: "symlink", sha256: sha256(`symlink\0${target}`) });
    } else if (entryStat.isDirectory()) {
      files.push({ path: relativePath, type: "directory", sha256: sha256("directory") });
      await walk(root, entryPath, files);
    } else if (entryStat.isFile()) {
      files.push({ path: relativePath, type: "file", sha256: sha256(await readFile(entryPath)) });
    } else {
      throw new Error(`unsupported resource entry: ${relativePath}`);
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function comparePaths(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
