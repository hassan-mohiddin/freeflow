#!/usr/bin/env node
// Local release preflight (references/release.md, "Preflight The Exact Release"): the declared version and whether it
// is valid and new, whether its tag already exists locally and where it points, the changelog's state for it, the
// source (branch, clean tree, HEAD), and for an npm package what `npm pack --dry-run` would publish. It changes
// nothing and publishes nothing. Registry state needs the network and is reported unavailable.
// Usage: release-preflight.mjs [--version <x.y.z>] [--tag-prefix <v>] [--root <repository>] [--no-pack] [--json]
// --version defaults to the declared version. Exit code 0 when no problem was found, 1 when one was, 2 on a usage
// error or outside a Git repository.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  branchState,
  changelog,
  git,
  latestTag,
  projectVersion,
  repositoryRoot,
  workingState,
} from "./lib/git-state.mjs";

const USAGE =
  "Usage: release-preflight.mjs [--version <x.y.z>] [--tag-prefix <v>] [--root <repository>] [--no-pack] [--json]";
let values;
try {
  ({ values } = parseArgs({
    options: {
      version: { type: "string" },
      "tag-prefix": { type: "string", default: "v" },
      root: { type: "string" },
      "no-pack": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}
const root = repositoryRoot(values.root ?? ".");
if (!root) {
  console.error("not inside a Git repository");
  process.exit(2);
}

const problems = [];
const facts = [];
const declared = projectVersion(root);
const version = values.version ?? declared?.version ?? null;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
if (!version) problems.push("no version: none declared (package.json, pyproject.toml, Cargo.toml) and none given");
else {
  if (!SEMVER.test(version)) problems.push(`version ${version} is not a valid x.y.z version`);
  if (values.version && declared?.version && declared.version !== values.version)
    problems.push(`version ${values.version} differs from the declared ${declared.version} (${declared.source})`);
}

const tagName = version ? `${values["tag-prefix"]}${version}` : null;
const tagCommit = tagName ? git(root, ["rev-list", "-n", "1", `refs/tags/${tagName}`]) : null;
const branch = branchState(root);
if (tagCommit) {
  if (tagCommit === branch.head)
    facts.push(`tag ${tagName} exists locally and points at HEAD: a release of this commit may already be tagged`);
  else problems.push(`tag ${tagName} already exists locally at ${tagCommit.slice(0, 12)}, not HEAD: never move it`);
}
const previous = latestTag(root);
if (previous && version && SEMVER.test(version)) {
  const parse = (text) =>
    text
      .replace(/^[^\d]*/, "")
      .split(/[-+]/)[0]
      .split(".")
      .map(Number);
  const [a, b] = [parse(version), parse(previous.tag)];
  const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (newer < 0 && previous.tag !== tagName)
    problems.push(`version ${version} is older than the latest tag ${previous.tag}`);
}

const notes = changelog(root);
if (!notes) facts.push("no changelog found");
else {
  const released = version && notes.versions.includes(version);
  if (released) facts.push(`${notes.file} has a section for ${version}`);
  else if (notes.unreleased?.entries)
    facts.push(`${notes.file}: ${notes.unreleased.entries} Unreleased entries, no ${version} section yet`);
  else problems.push(`${notes.file} has no ${version ?? "version"} section and no Unreleased entries`);
}

const working = workingState(root);
const dirty = working.staged.length + working.unstaged.length + working.conflicted.length;
if (branch.detached) facts.push(`detached HEAD at ${branch.head.slice(0, 12)}`);
if (dirty) problems.push(`${dirty} uncommitted change(s): a release is built from a commit`);
if (working.untracked.length) facts.push(`${working.untracked.length} untracked path(s): check none would be packed`);
if (branch.upstream && branch.ahead) facts.push(`${branch.ahead} commit(s) not on ${branch.upstream} (local refs)`);

// What npm would publish, from a dry run that runs no lifecycle scripts.
let pack = null;
if (!values["no-pack"] && existsSync(join(root, "package.json"))) {
  const run = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  try {
    const [result] = JSON.parse(run.stdout);
    const files = result.files.map((file) => file.path);
    const unexpected = files.filter((path) =>
      /(^|\/)(\.env(\..*)?|\.npmrc|.*\.(pem|key|p12)|\.freeflow\/|node_modules\/|.*\.log)$|(^|\/)\.freeflow\//.test(
        path,
      ),
    );
    pack = {
      name: result.name,
      version: result.version,
      files: files.length,
      size: result.size,
      unpackedSize: result.unpackedSize,
      unexpected,
    };
    if (result.version !== version) problems.push(`npm would pack version ${result.version}, not ${version}`);
    if (unexpected.length)
      problems.push(`npm would publish files that look private: ${unexpected.slice(0, 10).join(", ")}`);
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    for (const entry of [
      manifest.main,
      ...Object.values(typeof manifest.bin === "string" ? { bin: manifest.bin } : (manifest.bin ?? {})),
    ].filter(Boolean))
      if (!files.includes(entry.replace(/^\.\//, "")))
        problems.push(`package entry ${entry} is not in the packed files`);
  } catch {
    pack = { error: (run.stderr || run.stdout || "npm pack failed").trim().split("\n").slice(-3).join(" ") };
    problems.push(`npm pack --dry-run failed: ${pack.error}`);
  }
}

const report = {
  command: "release-preflight",
  root,
  version,
  declared,
  tag: { name: tagName, exists: Boolean(tagCommit), commit: tagCommit?.slice(0, 12) ?? null },
  latestTag: previous,
  source: {
    branch: branch.branch,
    head: branch.head,
    subject: branch.subject,
    dirty,
    untracked: working.untracked.length,
  },
  changelog: notes,
  pack,
  problems,
  facts,
  unavailable: [
    "whether the version is already on the registry",
    "remote tags",
    "CI on the release commit",
    "signing and publish permissions",
  ],
};
if (values.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `Release ${version ?? "(no version)"} as ${tagName ?? "(no tag)"} from ${branch.branch ?? "detached HEAD"} ${branch.head?.slice(0, 12) ?? ""} ${branch.subject ?? ""}`,
  );
  if (pack && !pack.error)
    console.log(`npm pack: ${pack.name}@${pack.version}, ${pack.files} files, ${pack.size} bytes packed`);
  for (const fact of facts) console.log(`- ${fact}`);
  console.log(
    problems.length
      ? `Problems (${problems.length}):\n${problems.map((each) => `- ${each}`).join("\n")}`
      : "No problem found locally.",
  );
  console.log(`Unavailable without the network: ${report.unavailable.join("; ")}.`);
}
process.exit(problems.length ? 1 : 0);
