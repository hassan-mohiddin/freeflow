// Read-only Git and project facts shared by Deliver Work's scripts. Nothing here fetches, writes or changes state:
// remote facts come from local remote-tracking refs, which are only as fresh as the last fetch.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export function run(cwd, command, args) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trimEnd();
  } catch {
    return null;
  }
}

export const git = (cwd, args) => run(cwd, "git", args);

export function repositoryRoot(start) {
  const root = git(resolve(start), ["rev-parse", "--show-toplevel"]);
  return root ? resolve(root) : null;
}

export function branchState(root) {
  const branch = git(root, ["branch", "--show-current"]) || null;
  const head = git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  const subject = head ? git(root, ["log", "-1", "--format=%s"]) : null;
  const upstream = branch ? git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]) : null;
  let ahead = null;
  let behind = null;
  if (upstream) {
    const counts = git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`]);
    if (counts) [behind, ahead] = counts.split(/\s+/).map(Number);
  }
  return { branch, detached: !branch && Boolean(head), head, subject, upstream, ahead, behind };
}

// Porcelain v1 status: staged and unstaged paths, untracked files and conflicts.
export function workingState(root) {
  const lines = (git(root, ["-c", "core.quotePath=false", "status", "--porcelain=v1", "-z"]) ?? "")
    .split("\0")
    .filter(Boolean);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const x = line[0];
    const y = line[1];
    const path = line.slice(3);
    const entry = { x, y, path };
    if (x === "R" || x === "C") entry.from = lines[(index += 1)];
    entries.push(entry);
  }
  const conflict = (entry) =>
    entry.x === "U" || entry.y === "U" || (entry.x === "A" && entry.y === "A") || (entry.x === "D" && entry.y === "D");
  return {
    entries,
    staged: entries.filter((entry) => entry.x !== " " && entry.x !== "?" && !conflict(entry)),
    unstaged: entries.filter((entry) => entry.y !== " " && entry.y !== "?" && !conflict(entry)),
    untracked: entries.filter((entry) => entry.x === "?"),
    conflicted: entries.filter(conflict),
  };
}

// A merge, rebase, cherry-pick, revert, bisect or patch application left in progress.
export function inProgress(root) {
  const gitDir = git(root, ["rev-parse", "--absolute-git-dir"]);
  if (!gitDir) return [];
  const markers = [
    ["MERGE_HEAD", "merge"],
    ["rebase-merge", "rebase"],
    ["rebase-apply/applying", "am (patch application)"],
    ["rebase-apply", "rebase"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
    ["BISECT_LOG", "bisect"],
  ];
  const found = [];
  for (const [marker, operation] of markers)
    if (existsSync(join(gitDir, marker)) && !found.includes(operation)) found.push(operation);
  if (found.includes("am (patch application)")) return found.filter((each) => each !== "rebase");
  return found;
}

// Worktrees, flagging the one holding the given directory (the session's working directory).
export function worktrees(root, cwd) {
  const text = git(root, ["worktree", "list", "--porcelain"]) ?? "";
  const here = resolve(cwd);
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const fields = Object.fromEntries(
        block.split("\n").map((line) => {
          const space = line.indexOf(" ");
          return space === -1 ? [line, true] : [line.slice(0, space), line.slice(space + 1)];
        }),
      );
      const path = resolve(fields.worktree);
      const inside = here === path || here.startsWith(`${path}${sep}`);
      return {
        path,
        branch: typeof fields.branch === "string" ? fields.branch.replace(/^refs\/heads\//, "") : null,
        head: typeof fields.HEAD === "string" ? fields.HEAD.slice(0, 12) : null,
        detached: fields.detached === true,
        locked: fields.locked !== undefined,
        prunable: fields.prunable !== undefined,
        sessionCwd: inside,
      };
    })
    .map((tree, _, all) => {
      // The innermost worktree holding the cwd is the session's; an outer one only contains it on disk.
      const holders = all.filter((each) => each.sessionCwd);
      const innermost = holders.sort((a, b) => b.path.length - a.path.length)[0];
      return { ...tree, sessionCwd: innermost ? innermost.path === tree.path : false };
    });
}

export function latestTag(root) {
  const tag = git(root, ["describe", "--tags", "--abbrev=0"]);
  if (!tag) return null;
  const at = git(root, ["rev-list", "-n", "1", tag]);
  const since = git(root, ["rev-list", "--count", `${tag}..HEAD`]);
  return { tag, commit: at?.slice(0, 12) ?? null, commitsSince: since === null ? null : Number(since) };
}

// The project's declared version: package.json, then pyproject.toml, then Cargo.toml.
export function projectVersion(root) {
  const packagePath = join(root, "package.json");
  if (existsSync(packagePath)) {
    try {
      const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
      if (parsed.version) return { version: parsed.version, source: "package.json", name: parsed.name ?? null };
    } catch {
      return { version: null, source: "package.json (not valid JSON)", name: null };
    }
  }
  for (const file of ["pyproject.toml", "Cargo.toml"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const match = /^\s*version\s*=\s*["']([^"']+)["']/m.exec(readFileSync(path, "utf8"));
    if (match) return { version: match[1], source: file, name: null };
  }
  return null;
}

// The changelog's Unreleased section: its categories and how many entries each holds.
export function changelog(root) {
  const file = ["CHANGELOG.md", "CHANGES.md", "HISTORY.md"].find((name) => existsSync(join(root, name)));
  if (!file) return null;
  const lines = readFileSync(join(root, file), "utf8").split("\n");
  const start = lines.findIndex((line) => /^##\s+\[?unreleased\]?/i.test(line));
  const versions = lines
    .filter((line) => /^##\s+\[?v?\d+\.\d+/.test(line))
    .map((line) => /^##\s+\[?v?(\d+\.\d+[^\]\s]*)/.exec(line)[1]);
  if (start === -1) return { file, unreleased: null, versions };
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const section = lines.slice(start + 1, end === -1 ? undefined : end);
  const categories = {};
  let category = "(none)";
  let entries = 0;
  for (const line of section) {
    const heading = /^###\s+(.*)$/.exec(line);
    if (heading) category = heading[1].trim();
    else if (/^\s*[-*]\s+\S/.test(line) && !/^\s{2,}/.test(line)) {
      categories[category] = (categories[category] ?? 0) + 1;
      entries += 1;
    }
  }
  return { file, unreleased: { entries, categories }, versions };
}

export const show = (root, path) => {
  const relativePath = relative(root, path);
  return relativePath.startsWith("..") ? path : relativePath || ".";
};
