#!/usr/bin/env node
// The delivery state in one read-only call, before any commit, push, merge, cleanup or release: branch or detached
// HEAD, upstream and ahead/behind from local refs, staged, unstaged, untracked and conflicted counts, a Git operation
// left in progress, every worktree with the one holding this session's working directory flagged, the latest tag, the
// declared version and the changelog's Unreleased section. Anything that needs the network is reported unavailable.
// It also prints Review Work's lines for HEAD (review-status.mjs): whether an independent review is on record for it,
// from the task's reviews/ (--task) or this session's; when a review is due, from the review rules ("Review at:", the
// project's before the Freeflow home's before the default, a pull request); with --step, whether that step needs one;
// and with --base the floor and the flags the review plan gives the change.
// Usage: delivery-state.mjs [--root <repository>] [--cwd <session directory>] [--task <task folder>] [--base <ref>]
//                           [--step <commit|push|pull-request>] [--json]
// --cwd defaults to the current directory. Exit code 0 when it reports, 2 outside a Git repository.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  branchState,
  changelog,
  inProgress,
  latestTag,
  projectVersion,
  repositoryRoot,
  workingState,
  worktrees,
} from "./lib/git-state.mjs";

const USAGE =
  "Usage: delivery-state.mjs [--root <repository>] [--cwd <session directory>] [--task <task folder>] [--base <ref>] [--step <commit|push|pull-request>] [--json]";
const REVIEW_STATUS = join(dirname(fileURLToPath(import.meta.url)), "../../review-work/scripts/review-status.mjs");
let values;
try {
  ({ values } = parseArgs({
    options: {
      root: { type: "string" },
      cwd: { type: "string" },
      task: { type: "string" },
      base: { type: "string" },
      step: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}
const cwd = values.cwd ?? process.cwd();
const root = repositoryRoot(values.root ?? cwd);
if (!root) {
  console.error("not inside a Git repository");
  process.exit(2);
}

const branch = branchState(root);
const working = workingState(root);
const operations = inProgress(root);
const trees = worktrees(root, cwd);
const tag = latestTag(root);
const version = projectVersion(root);
const notes = changelog(root);

/** Review Work's lines for HEAD, or why there are none; it reads only the review records, the review rules and Git. */
function reviewState() {
  const only = (line) => ({ line, lines: [line], state: null });
  if (!branch.head) return only("Review: no commits yet");
  if (!existsSync(REVIEW_STATUS))
    return only("Review: unavailable (Review Work's review-status.mjs is not installed here)");
  const args = [REVIEW_STATUS, "--root", root, "--json"];
  if (values.task) args.push("--task", values.task);
  if (values.base) args.push("--base", values.base);
  if (values.step) args.push("--step", values.step);
  const run = spawnSync(process.execPath, args, { encoding: "utf8" });
  try {
    const status = JSON.parse(run.stdout);
    return {
      line: status.line,
      lines: status.lines,
      state: status.state,
      record: status.record,
      reviews: status.reviews,
      reviewAt: status.reviewAt,
      step: status.step,
      due: status.due,
    };
  } catch {
    return only(`Review: unavailable (${(run.stderr || "review-status failed").trim().split("\n")[0]})`);
  }
}
const review = reviewState();
const state = {
  command: "delivery-state",
  root,
  branch,
  working: {
    staged: working.staged.length,
    unstaged: working.unstaged.length,
    untracked: working.untracked.length,
    conflicted: working.conflicted.length,
  },
  inProgress: operations,
  worktrees: trees,
  latestTag: tag,
  version,
  versionTagged:
    version?.version && tag ? [tag.tag, `v${version.version}`].includes(tag.tag) || tag.tag === version.version : false,
  changelog: notes,
  review,
  unavailable: [
    "the remote's current state: ahead/behind uses local remote-tracking refs (fetch to refresh them, when that is covered)",
    "pull requests, CI results, registry versions and deployments",
  ],
};

if (values.json) console.log(JSON.stringify(state, null, 2));
else {
  const out = [];
  out.push(
    branch.branch
      ? `Branch: ${branch.branch}${branch.upstream ? `, upstream ${branch.upstream} (ahead ${branch.ahead}, behind ${branch.behind}, from local refs)` : ", no upstream"}`
      : branch.detached
        ? `Detached HEAD at ${branch.head.slice(0, 12)}`
        : "No commits yet",
  );
  if (branch.head) out.push(`HEAD: ${branch.head.slice(0, 12)} ${branch.subject}`);
  out.push(
    `Working tree: ${state.working.staged} staged, ${state.working.unstaged} unstaged, ${state.working.untracked} untracked, ${state.working.conflicted} conflicted`,
  );
  out.push(`In progress: ${operations.length ? operations.join(", ") : "no Git operation"}`);
  out.push(`Worktrees (${trees.length}):`);
  for (const tree of trees)
    out.push(
      `  ${tree.path} ${tree.branch ?? (tree.detached ? "(detached)" : "")} ${tree.head ?? ""}${tree.sessionCwd ? "  <- this session's cwd is inside" : ""}${tree.locked ? " [locked]" : ""}${tree.prunable ? " [prunable]" : ""}`,
    );
  out.push(
    `Latest tag: ${tag ? `${tag.tag} at ${tag.commit}, ${tag.commitsSince} commit(s) since` : "none"}; version: ${version ? `${version.version ?? "unreadable"} (${version.source})` : "none declared"}`,
  );
  if (notes)
    out.push(
      `Changelog ${notes.file}: ${
        notes.unreleased
          ? `Unreleased has ${notes.unreleased.entries} entr${notes.unreleased.entries === 1 ? "y" : "ies"}${
              Object.keys(notes.unreleased.categories).length
                ? ` (${Object.entries(notes.unreleased.categories)
                    .map(([name, count]) => `${name} ${count}`)
                    .join(", ")})`
                : ""
            }`
          : "no Unreleased section"
      }`,
    );
  else out.push("Changelog: none found");
  out.push(...review.lines);
  out.push(`Unavailable without the network: ${state.unavailable.join("; ")}.`);
  console.log(out.join("\n"));
}
