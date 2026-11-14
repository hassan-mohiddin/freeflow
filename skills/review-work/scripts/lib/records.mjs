// Review records (SPEC-007 4.5): one JSON line per adjudicated review in <reviews>/records.jsonl, bound to the commit
// it reviewed, beside the briefs and reports. With a task the folder is the task's reviews/, kept and synced with the
// store; without one it is this machine's <FREEFLOW_HOME>/sessions/<session>/reviews/. Read by review-status.mjs,
// review-plan.mjs and Deliver Work's delivery-state.mjs; written by check-adjudication.mjs --record.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const RECORD_VERSION = 1;
export const RECORDS_FILE = "records.jsonl";
/** Judgments that let a review cover its head; Blocking and Inconclusive cover nothing. */
export const COVERING = new Set(["Pass", "Non-blocking"]);

/** The session a script runs in, as the harness names it (Claude Code, else a layer's FREEFLOW_SESSION); or null. */
export function sessionOf(env = process.env) {
  const id = env.CLAUDE_CODE_SESSION_ID || env.FREEFLOW_SESSION || "";
  return /^[A-Za-z0-9._-]+$/.test(id) ? id : null;
}

/** Where a review's files go: the task's reviews/, or this session's in the Freeflow home; null with neither. */
export function reviewsDir({ task, env = process.env }) {
  if (task) return join(resolve(task), "reviews");
  const id = sessionOf(env);
  if (!id) return null;
  return join(env.FREEFLOW_HOME || join(homedir(), ".freeflow"), "sessions", id, "reviews");
}

/** The records in a reviews folder, oldest first; a line that is not a record is skipped and counted. */
export function readRecords(dir) {
  const path = dir && join(dir, RECORDS_FILE);
  if (!path || !existsSync(path)) return { records: [], skipped: 0 };
  let skipped = 0;
  const records = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record && typeof record.head === "string" && typeof record.judgment === "string") records.push(record);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { records, skipped };
}

export function appendRecord(dir, record) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, RECORDS_FILE), `${JSON.stringify({ v: RECORD_VERSION, ...record })}\n`);
}

const git = (root, args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
const commitOf = (root, ref) => {
  const run = git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return run.status === 0 ? run.stdout.trim() : null;
};
const isAncestor = (root, commit, head) => git(root, ["merge-base", "--is-ancestor", commit, head]).status === 0;
const distance = (root, from, to) => Number(git(root, ["rev-list", "--count", `${from}..${to}`]).stdout.trim() || 0);

/**
 * What the records say about `head`: `covered` when a covering record's head is the head, `stale` when the nearest
 * covering record is an ancestor (with the commits since and the re-review range that would cover them), else `none`.
 * A covering record is a Pass or Non-blocking review that is Review 1, or a later round whose base is the head of an
 * earlier review on record, so the diff-only re-review completes it. Records of commits not in head's history are
 * ignored.
 */
export function coverage(root, headRef, records) {
  const head = commitOf(root, headRef);
  if (!head) return { state: "none", head: null, reason: `no such commit: ${headRef}` };
  const resolved = records
    .map((record) => ({ ...record, headCommit: commitOf(root, record.head), baseCommit: commitOf(root, record.base) }))
    .filter((record) => record.headCommit && isAncestor(root, record.headCommit, head));
  const reviewedHeads = new Set(resolved.map((record) => record.headCommit));
  const covers = (record) =>
    COVERING.has(record.judgment) &&
    (Number(record.round ?? 1) <= 1 || (record.baseCommit && reviewedHeads.has(record.baseCommit)));
  const latest = (list) => list.at(-1);
  const atHead = resolved.filter((record) => record.headCommit === head);
  const coveringAtHead = latest(atHead.filter(covers));
  if (coveringAtHead) return { state: "covered", head, record: coveringAtHead };
  const blockedAtHead = latest(atHead);
  const earlier = resolved.filter((record) => record.headCommit !== head && covers(record));
  if (earlier.length) {
    const nearest = earlier.reduce((best, record) =>
      distance(root, record.headCommit, head) <= distance(root, best.headCommit, head) ? record : best,
    );
    return {
      state: "stale",
      head,
      record: nearest,
      since: distance(root, nearest.headCommit, head),
      rereview: `${nearest.headCommit.slice(0, 12)}..${head.slice(0, 12)}`,
      ...(blockedAtHead ? { blocked: blockedAtHead } : {}),
    };
  }
  return { state: "none", head, ...(blockedAtHead ? { blocked: blockedAtHead } : {}) };
}

/** The one line Deliver Work and the plan print; with the plan, what a review of the head would be. */
export function coverageLine(result, planned) {
  const short = (commit) => commit.slice(0, 12);
  if (!result.head) return `Review: ${result.reason}`;
  if (result.state === "covered") {
    const { record } = result;
    return `Review: on record for ${short(result.head)} (${record.judgment} after Review ${record.round ?? 1})`;
  }
  const blocked = result.blocked
    ? `; the review of ${short(result.head)} on record is ${result.blocked.judgment}, which covers nothing`
    : "";
  if (result.state === "stale")
    return `Review: on record for ${short(result.record.headCommit)}; ${result.since} commit${result.since === 1 ? "" : "s"} since: a diff-only re-review covers ${result.rereview}${blocked}`;
  const plan = planned
    ? `; the floor: 1 reviewer, 1 round${planned.flags.length ? `; flags: ${planned.flags.join(", ")}` : ""}`
    : "";
  return `Review: none for ${short(result.head)}${plan}${blocked}`;
}
