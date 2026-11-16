// The review plan: the floor every change gets (one reviewer, one round), when a review is due (lib/review-rules.mjs,
// read at the base commit, never the branch), and the flags the diff raises: the built-in flags (lib/triggers.mjs), the
// open agreement's "Review:" lines when a task is named, and the flags the agent adds with their reason. A flag is a
// reason to weigh more than the floor with the user; it never changes the floor. The same inputs always give the same
// plan. Shared by review-plan.mjs, review-status.mjs and review-packet.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewAt, reviewAtText } from "./review-rules.mjs";
import { BUILTIN_NAMES, detectBuiltins, globToRegExp } from "./triggers.mjs";

/** The floor: one reviewer and one round, for every change a review is due for. Above it is the agent's call. */
export const FLOOR = { reviewers: 1, rounds: 1 };
/** What a reviewer reads, by default. */
export const EVIDENCE = "the diff, the files it touches, the tests and the covering feature files";

export class PlanError extends Error {}

const git = (root, args) => {
  const run = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new PlanError((run.stderr || `git ${args.join(" ")} failed`).trim());
  return run.stdout;
};
export const commitOf = (root, ref) => {
  const run = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
    cwd: root,
    encoding: "utf8",
  });
  return run.status === 0 ? run.stdout.trim() : null;
};

/** The changed files with their added and removed lines; a binary file has no line counts. */
export function changedFiles(root, base, head) {
  return git(root, ["-c", "core.quotePath=false", "diff", "--numstat", "--no-renames", base, head])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, removed, ...rest] = line.split("\t");
      const binary = added === "-";
      return {
        path: rest.join("\t"),
        added: binary ? 0 : Number(added),
        removed: binary ? 0 : Number(removed),
        binary,
      };
    });
}

/**
 * The agreement's review lines, `- Review: src/billing/**` or `- Review: all`, from the open agreement of the task's
 * record.md: globs separated by commas or spaces. A depth word left from before (quick, standard, deep) is dropped.
 */
export function agreementLines(task) {
  const path = task && join(task, "record.md");
  if (!path || !existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n");
  const start = lines.findIndex((line) => /^### Agreement A-\d+/.test(line));
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => index > start && /^#{1,3} /.test(line));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .map((line) => /^- Review:\s*(.+)$/.exec(line)?.[1].trim())
    .filter(Boolean)
    .map((text) => {
      const words = text.split(/[\s,]+/).filter(Boolean);
      if (["quick", "standard", "deep"].includes(words.at(-1))) words.pop();
      return { text, all: words.length === 1 && words[0] === "all", globs: words };
    });
}

/**
 * The plan for base..head.
 * @param {{ root: string, base: string, head?: string, task?: string|null, adds?: {trigger: string, reason: string}[], env?: object }} input
 */
export function planReview({ root, base, head = "HEAD", task = null, adds = [], env = process.env }) {
  const baseCommit = commitOf(root, base);
  if (!baseCommit) throw new PlanError(`no such commit: ${base}`);
  const headCommit = commitOf(root, head);
  if (!headCommit) throw new PlanError(`no such commit: ${head}`);
  for (const add of adds) {
    if (!BUILTIN_NAMES.includes(add.trigger))
      throw new PlanError(`--add takes a built-in flag (${BUILTIN_NAMES.join(", ")}), not ${add.trigger}`);
    if (!add.reason?.trim()) throw new PlanError(`--add ${add.trigger} needs --reason`);
  }
  const files = changedFiles(root, baseCommit, headCommit);
  const lines = files.reduce((sum, file) => sum + file.added + file.removed, 0);
  const { fired, byPathOnly } = detectBuiltins({ root, base: baseCommit, head: headCommit, files });

  const flags = fired.map((builtin) => ({
    source: "built-in",
    name: builtin.name,
    paths: builtin.hits.map((hit) => hit.path),
    detail: builtin.hits.map((hit) => `${hit.path} ${hit.why}`),
  }));
  for (const line of agreementLines(task)) {
    const patterns = line.globs.map(globToRegExp);
    const paths = line.all
      ? files.map((file) => file.path)
      : files.map((file) => file.path).filter((path) => patterns.some((pattern) => pattern.test(path)));
    if (paths.length)
      flags.push({ source: "agreement", name: "the agreement", paths, detail: [`Review: ${line.text}`] });
  }
  for (const add of adds) flags.push({ source: "added", name: add.trigger, detail: [`added: ${add.reason.trim()}`] });

  return {
    base: { ref: base, commit: baseCommit },
    head: { ref: head, commit: headCommit },
    files: files.length,
    lines,
    reviewAt: reviewAt({ root, commit: baseCommit, env }),
    floor: FLOOR,
    evidence: EVIDENCE,
    flags,
    byPathOnly,
  };
}

/** The flags' names, once each, as the brief's Plan line and the status line give them. */
export function flagNames(plan) {
  return [...new Set(plan.flags.map((flag) => (flag.source === "agreement" ? "the agreement" : flag.name)))];
}

/** The plan as the agent and the user read it. */
export function planText(plan, recordLine) {
  const short = (commit) => commit.slice(0, 8);
  const out = [
    `Review plan for ${plan.files} file${plan.files === 1 ? "" : "s"}, ${plan.base.ref} (${short(plan.base.commit)})..${plan.head.ref} (${short(plan.head.commit)})`,
    ...reviewAtText(plan.reviewAt, plan.base.ref).map((line) => `  ${line}`),
    "  Floor: 1 reviewer, 1 round (Review 1); after it you check the fixes, with no second round by rule",
  ];
  if (plan.flags.length) {
    out.push("  Flags (each a reason to weigh more than the floor with the user; none changes it):");
    for (const flag of plan.flags) {
      const label = flag.source === "added" ? `${flag.name} (added)` : flag.name;
      const shown = flag.detail.slice(0, 3);
      const more = flag.detail.length - shown.length;
      out.push(`    - ${label}: ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}`);
    }
    out.push(
      "  Above the floor: your call with the user: more reviewers, each with a different lens, or a stronger model; propose it with the reason and the cost",
    );
  } else out.push("  Flags: none");
  out.push("  Reviewer model: the routing table's review row (delegate open --kind review)");
  for (const file of plan.byPathOnly) out.push(`  Judged by path only: ${file.path} (${file.reason})`);
  if (recordLine) out.push(`  Already on record: ${recordLine.replace(/^Review: /, "")}`);
  return out.join("\n");
}
