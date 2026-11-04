#!/usr/bin/env node
// Whether an independent review is on record for a commit (SPEC-007 4.5), from the review records in the task's
// reviews/records.jsonl, or this session's in the Freeflow home without a task: covered (the latest Pass or
// Non-blocking review of that commit, or a diff-only re-review that completes an earlier one), stale (a covering review
// of an ancestor, with the commits since and the range a diff-only re-review would cover), or none. A Blocking or
// Inconclusive review covers nothing; records of commits outside the head's history are ignored. With --base it also
// names the depth the plan gives the change. Deliver Work runs it at the review unit's boundary; until Freeflow's gates
// arrive, that check is the skill's, not the host's.
// Usage: review-status.mjs [--head <ref>] [--task <task folder>] [--base <ref>] [--root <repository>] [--json]
// Exit code 0 when a review covers the head, 1 when none does (none or stale), 2 on a usage or Git error.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { PlanError, planReview } from "./lib/plan.mjs";
import { coverage, coverageLine, readRecords, reviewsDir } from "./lib/records.mjs";

const USAGE =
  "Usage: review-status.mjs [--head <ref>] [--task <task folder>] [--base <ref>] [--root <repository>] [--json]";

function fail(message) {
  console.error(message);
  process.exit(2);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      head: { type: "string", default: "HEAD" },
      task: { type: "string" },
      base: { type: "string" },
      root: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}

let root;
try {
  root = resolve(
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: resolve(values.root ?? "."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim(),
  );
} catch {
  fail("not inside a Git repository");
}

const dir = reviewsDir({ task: values.task });
const { records, skipped } = readRecords(dir);
const status = coverage(root, values.head, records);
if (!status.head) fail(`review-status: ${status.reason}`);
let planned = null;
if (values.base) {
  try {
    planned = planReview({
      root,
      base: values.base,
      head: values.head,
      task: values.task ? resolve(values.task) : null,
    });
  } catch (error) {
    if (error instanceof PlanError) fail(`review-status: ${error.message}`);
    throw error;
  }
}
const line = coverageLine(status, planned?.depth);
if (values.json)
  console.log(
    JSON.stringify(
      {
        command: "review-status",
        root,
        reviews: dir,
        state: status.state,
        head: status.head,
        record: status.record ?? null,
        since: status.since ?? 0,
        rereview: status.rereview ?? null,
        blocked: status.blocked ?? null,
        plannedDepth: planned?.depth ?? null,
        skippedLines: skipped,
        line,
      },
      null,
      2,
    ),
  );
else {
  console.log(line);
  if (!dir)
    console.log(
      "No reviews folder: give --task, or run where the session is named (CLAUDE_CODE_SESSION_ID or FREEFLOW_SESSION).",
    );
  if (skipped) console.log(`Skipped ${skipped} line${skipped === 1 ? "" : "s"} of records.jsonl that are not records.`);
}
process.exit(status.state === "covered" ? 0 : 1);
