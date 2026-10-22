#!/usr/bin/env node
// The route for a simple push (references/push.md): the current branch, its upstream or the remote it would go to, the
// commits it would send from local refs, and the stop conditions the local state shows. It prints the push command it
// would use and never runs it.
// Usage: push-route.mjs [--remote <name>] [--root <repository>] [--json]
// Exit code 0 when a simple push is possible from what it can see, 1 when a stop condition holds, 2 on a usage error
// or outside a Git repository.
import { parseArgs } from "node:util";
import { branchState, git, inProgress, repositoryRoot, workingState } from "./lib/git-state.mjs";

const USAGE = "Usage: push-route.mjs [--remote <name>] [--root <repository>] [--json]";
let values;
try {
  ({ values } = parseArgs({
    options: { remote: { type: "string" }, root: { type: "string" }, json: { type: "boolean", default: false } },
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

const branch = branchState(root);
const remotes = (git(root, ["remote"]) ?? "").split("\n").filter(Boolean);
const urls = Object.fromEntries(remotes.map((name) => [name, git(root, ["remote", "get-url", "--push", name])]));
const stops = [];
const notes = [];
let remote = values.remote ?? null;
let destination = null;
let command = null;

if (!branch.head) stops.push("no commits to push");
if (branch.detached) stops.push("HEAD is detached: push a named branch");
for (const operation of inProgress(root)) stops.push(`a ${operation} is in progress`);
if (values.remote && !remotes.includes(values.remote)) stops.push(`no remote named ${values.remote}`);

if (branch.branch && branch.upstream) {
  const [upstreamRemote, ...rest] = branch.upstream.split("/");
  destination = { remote: upstreamRemote, branch: rest.join("/") };
  if (remote && remote !== upstreamRemote)
    stops.push(`the upstream is on ${upstreamRemote}, not ${remote}: pushing elsewhere changes the route`);
  remote = upstreamRemote;
  if (destination.branch !== branch.branch)
    notes.push(`the upstream branch is named ${destination.branch}, not ${branch.branch}`);
  if (branch.behind && branch.ahead)
    stops.push(`local and ${branch.upstream} have diverged (ahead ${branch.ahead}, behind ${branch.behind})`);
  else if (branch.behind) stops.push(`${branch.upstream} has ${branch.behind} commit(s) this branch lacks`);
  else if (!branch.ahead) notes.push(`nothing to push: ${branch.upstream} already has HEAD (local refs)`);
  command = `git push ${remote} ${branch.branch}${destination.branch !== branch.branch ? `:${destination.branch}` : ""}`;
} else if (branch.branch) {
  if (!remote) {
    if (remotes.length === 1) [remote] = remotes;
    else if (remotes.includes("origin")) {
      remote = "origin";
      notes.push(`several remotes (${remotes.join(", ")}); origin assumed: confirm it`);
    } else
      stops.push(remotes.length ? `no upstream and several remotes (${remotes.join(", ")}): name one` : "no remote");
  }
  if (remote) {
    destination = { remote, branch: branch.branch };
    const existing = git(root, ["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${branch.branch}`]);
    if (existing) {
      const behind = Number(git(root, ["rev-list", "--count", `HEAD..${remote}/${branch.branch}`]) ?? 0);
      if (behind) stops.push(`${remote}/${branch.branch} exists with ${behind} commit(s) this branch lacks`);
      notes.push(`${remote}/${branch.branch} exists but is not the upstream: setting it is part of the yes`);
    }
    command = `git push --set-upstream ${remote} ${branch.branch}`;
    notes.push("no upstream yet: this push sets one");
  }
}

const commits = destination
  ? (
      git(root, ["log", "--oneline", "--no-decorate", `${destination.remote}/${destination.branch}..HEAD`]) ??
      git(root, ["log", "--oneline", "--no-decorate", "HEAD", "--not", `--remotes=${destination.remote}`]) ??
      ""
    )
      .split("\n")
      .filter(Boolean)
  : [];
const working = workingState(root);
if (working.staged.length || working.unstaged.length)
  notes.push(`${working.staged.length + working.unstaged.length} uncommitted change(s) will not be pushed`);

const report = {
  command: "push-route",
  root,
  branch: branch.branch,
  head: branch.head?.slice(0, 12) ?? null,
  upstream: branch.upstream,
  ahead: branch.ahead,
  behind: branch.behind,
  remotes: urls,
  destination,
  commits: commits.slice(0, 20),
  commitsCut: Math.max(0, commits.length - 20),
  pushCommand: stops.length ? null : command,
  stops,
  notes,
  notChecked: [
    "the remote's current state (counts use local refs)",
    "branch protection and shared-branch policy",
    "whether a force push would be needed",
  ],
};
if (values.json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(
    `Branch ${branch.branch ?? "(detached)"} at ${report.head ?? "none"} -> ${destination ? `${destination.remote}/${destination.branch}` : "no destination"}${remote && urls[remote] ? ` (${urls[remote]})` : ""}`,
  );
  console.log(`Commits to send (${commits.length}, from local refs):`);
  for (const commit of report.commits) console.log(`  ${commit}`);
  if (report.commitsCut) console.log(`  ... ${report.commitsCut} more`);
  for (const note of notes) console.log(`Note: ${note}`);
  console.log(stops.length ? `Stop:\n${stops.map((each) => `- ${each}`).join("\n")}` : `Simple push: ${command}`);
  console.log(`Not checked: ${report.notChecked.join("; ")}.`);
}
process.exit(stops.length ? 1 : 0);
