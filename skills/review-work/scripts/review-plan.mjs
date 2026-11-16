#!/usr/bin/env node
// The review plan for a change (lib/plan.mjs): when a review is due (the "Review at:" rule, read at the base commit,
// never the branch), the floor every change gets (one reviewer, one round), and the flags the diff raises with their
// reasons: the built-in flags (lib/triggers.mjs), the open agreement's "Review:" lines when --task names a task, and the
// flags the agent adds with --add and --reason. A flag never changes the floor; nothing here removes one. It reads and
// changes nothing else, so the same inputs always give the same plan.
// Usage: review-plan.mjs --base <ref> [--head <ref>] [--task <task folder>] [--add <flag> --reason <text>]...
//                        [--root <repository>] [--json]
// Exit code 0 with the plan; 2 on a usage or Git error.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { PlanError, planReview, planText } from "./lib/plan.mjs";
import { coverage, coverageLine, readRecords, reviewsDir } from "./lib/records.mjs";

const USAGE =
  "Usage: review-plan.mjs --base <ref> [--head <ref>] [--task <task folder>] [--add <flag> --reason <text>]... [--root <repository>] [--json]";

function fail(message) {
  console.error(message);
  process.exit(2);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      base: { type: "string" },
      head: { type: "string", default: "HEAD" },
      task: { type: "string" },
      add: { type: "string", multiple: true, default: [] },
      reason: { type: "string", multiple: true, default: [] },
      root: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (!values.base) fail(USAGE);
if (values.add.length !== values.reason.length) fail(`each --add needs its --reason\n${USAGE}`);

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

let plan;
try {
  plan = planReview({
    root,
    base: values.base,
    head: values.head,
    task: values.task ? resolve(values.task) : null,
    adds: values.add.map((trigger, index) => ({ trigger, reason: values.reason[index] })),
  });
} catch (error) {
  if (error instanceof PlanError) fail(`review-plan: ${error.message}`);
  throw error;
}
const dir = reviewsDir({ task: values.task });
const status = coverage(root, plan.head.commit, readRecords(dir).records);
const line = coverageLine(status);
if (values.json)
  console.log(JSON.stringify({ command: "review-plan", root, ...plan, reviews: dir, onRecord: line }, null, 2));
else console.log(planText(plan, line));
