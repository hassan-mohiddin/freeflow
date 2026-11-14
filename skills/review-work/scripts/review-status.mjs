#!/usr/bin/env node
// Whether an independent review is on record for a commit, from the review records in the task's reviews/records.jsonl,
// or this session's in the Freeflow home without a task: covered (the latest Pass or Non-blocking review of that
// commit, or a diff-only re-review that completes an earlier one), stale (a covering review of an ancestor, with the
// commits since and the range a diff-only re-review would cover), or none. A Blocking or Inconclusive review covers
// nothing; records of commits outside the head's history are ignored. It also prints when a review is due, from the
// review rules (lib/review-rules.mjs): the project's "Review at:" line at --base (or the head without it), else the
// Freeflow home's rules/review.md, else the default, a pull request. With --step it says whether that step needs a
// review on record: a rule's step and every later one do (commit, then push, then pull request), so every pull request
// needs one. With --base it also names the floor and the flags the plan gives the change. Deliver Work runs it
// (through delivery-state.mjs) before the step; until Freeflow's gates arrive, that check is the skill's, not the host's.
// Usage: review-status.mjs [--head <ref>] [--task <task folder>] [--base <ref>] [--step <commit|push|pull-request>]
//                          [--root <repository>] [--json]
// Exit code 0 when a review covers the head, or --step names a step no review is due at; 1 when a review is needed
// and none covers the head (none or stale); 2 on a usage or Git error.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { PlanError, commitOf, flagNames, planReview } from "./lib/plan.mjs";
import { coverage, coverageLine, readRecords, reviewsDir } from "./lib/records.mjs";
import { REVIEW_AT, dueAt, reviewAt, reviewAtText } from "./lib/review-rules.mjs";

const USAGE =
  "Usage: review-status.mjs [--head <ref>] [--task <task folder>] [--base <ref>] [--step <commit|push|pull-request>] [--root <repository>] [--json]";
const STEPS = {
  commit: "commit",
  push: "push",
  "pull-request": "pull request",
  "pull request": "pull request",
  pr: "pull request",
};

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
      step: { type: "string" },
      root: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const step = values.step === undefined ? null : STEPS[values.step.toLowerCase()];
if (values.step !== undefined && !step) fail(`--step takes commit, push or pull-request, not ${values.step}\n${USAGE}`);

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
// The rule is read where the plan reads it: at the base when one is given, so a change never relaxes its own rule.
const rulesRef = values.base ?? values.head;
const rule = reviewAt({ root, commit: planned?.base.commit ?? commitOf(root, rulesRef) });
const due = step ? dueAt(rule.value, step) : null;
const line = coverageLine(status, planned ? { flags: flagNames(planned) } : null);
const stepLine = step
  ? due
    ? `This step (${step}): a review is due${status.state === "covered" ? ", and one is on record" : ""}`
    : `This step (${step}): no review is due (one is due at: ${REVIEW_AT.slice(REVIEW_AT.indexOf(rule.value)).join(", ")})`
  : null;
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
        reviewAt: rule,
        step,
        due,
        floor: planned ? planned.floor : null,
        flags: planned ? flagNames(planned) : null,
        skippedLines: skipped,
        line,
        lines: [line, ...reviewAtText(rule, rulesRef), ...(stepLine ? [stepLine] : [])],
      },
      null,
      2,
    ),
  );
else {
  console.log(line);
  for (const each of reviewAtText(rule, rulesRef)) console.log(each);
  if (stepLine) console.log(stepLine);
  if (!dir)
    console.log(
      "No reviews folder: give --task, or run where the session is named (CLAUDE_CODE_SESSION_ID or FREEFLOW_SESSION).",
    );
  if (skipped) console.log(`Skipped ${skipped} line${skipped === 1 ? "" : "s"} of records.jsonl that are not records.`);
}
process.exit(status.state === "covered" || due === false ? 0 : 1);
