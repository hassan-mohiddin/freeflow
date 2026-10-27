#!/usr/bin/env node
// A study's plan lock, run receipts and deviation log. The formats are in references/artifacts.md; the rules for
// using them are in references/running.md.

import { parseArgs } from "node:util";

import {
  addDeviation,
  amendPlan,
  checkStudy,
  clearDeviation,
  lockPath,
  lockPlan,
  manifest,
  runStep,
} from "./lib/study.mjs";

const USAGE = [
  "Usage: study.mjs lock <plan.md> --by <who locked it>",
  "       study.mjs amend <plan.md> --by <who> --reason <why the plan changed>",
  "       study.mjs run <plan.md> [--unit <unit> --arm <arm> --trial <n>] [--input <path>]... [--output <path>]... -- <command> [args...]",
  "       study.mjs deviation <plan.md> --what <what departed from the plan> --by <who logged it> [--unit <unit>] [--arm <arm>]",
  "       study.mjs clear <plan.md> <D-id> --by <who cleared it>",
  "       study.mjs check <plan.md> [--json]",
  "       study.mjs manifest <plan.md> [--json]",
  "",
  "The lock is <plan>.lock.json; receipts go to runs.jsonl and deviations to deviations.jsonl, beside the plan.",
  "run exits with the command's own exit code; its receipt records it either way.",
].join("\n");

function fail(message) {
  console.error(message);
  process.exit(2);
}

const separator = process.argv.indexOf("--");
const own = separator < 0 ? process.argv.slice(2) : process.argv.slice(2, separator);
const command = separator < 0 ? [] : process.argv.slice(separator + 1);

let parsed;
try {
  parsed = parseArgs({
    args: own,
    allowPositionals: true,
    options: {
      by: { type: "string" },
      reason: { type: "string" },
      what: { type: "string" },
      unit: { type: "string" },
      arm: { type: "string" },
      trial: { type: "string" },
      input: { type: "string", multiple: true, default: [] },
      output: { type: "string", multiple: true, default: [] },
      json: { type: "boolean", default: false },
      help: { type: "boolean" },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values, positionals } = parsed;
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
const [action, plan, extra] = positionals;
if (!action || !plan) fail(USAGE);

const attempt = (work) => {
  try {
    return work();
  } catch (error) {
    fail(error.message);
  }
};

if (action === "lock") {
  const lock = attempt(() => lockPlan(plan, { by: values.by }));
  console.log(`Locked ${plan} (sha256 ${lock.entries[0].sha256}) by ${values.by}: ${lockPath(plan)}`);
} else if (action === "amend") {
  const entry = attempt(() => amendPlan(plan, { by: values.by, reason: values.reason }));
  console.log(`Amended ${plan} (sha256 ${entry.sha256}) by ${entry.by}: ${entry.reason}`);
} else if (action === "run") {
  const { receipt, stdout, stderr } = attempt(() =>
    runStep(plan, command, {
      inputs: values.input,
      outputs: values.output,
      unit: values.unit,
      arm: values.arm,
      trial: values.trial,
    }),
  );
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  const outcome = receipt.error ? `could not start: ${receipt.error}` : `exit ${receipt.exit_code ?? receipt.signal}`;
  console.error(
    `study.mjs: receipt ${receipt.id}, ${outcome}, ${receipt.duration_ms} ms${receipt.plan_locked ? "" : " (plan not locked: a pilot or exploratory run)"}`,
  );
  process.exit(receipt.exit_code ?? 1);
} else if (action === "deviation") {
  const record = attempt(() =>
    addDeviation(plan, { what: values.what, unit: values.unit, arm: values.arm, by: values.by }),
  );
  console.log(`Logged ${record.id}: ${record.what} (holds the analysis until cleared)`);
} else if (action === "clear") {
  if (!extra) fail(USAGE);
  const record = attempt(() => clearDeviation(plan, extra, { by: values.by }));
  console.log(`Cleared ${record.id} by ${record.by}`);
} else if (action === "check") {
  const result = attempt(() => checkStudy(plan));
  if (values.json) console.log(JSON.stringify({ plan, ...result }, null, 2));
  else {
    console.log(`${plan}: ${result.ok ? "ready for analysis" : `${result.problems.length} problem(s)`}`);
    for (const problem of result.problems) console.log(`  problem: ${problem}`);
    const { beforeLock, otherPlan } = result.manifest;
    if (beforeLock > 0) console.log(`  note: ${beforeLock} receipt(s) ran before the lock (pilot or exploratory)`);
    if (otherPlan > 0) console.log(`  note: ${otherPlan} receipt(s) ran under a plan hash the lock does not record`);
  }
  process.exit(result.ok ? 0 : 1);
} else if (action === "manifest") {
  const view = attempt(() => manifest(plan));
  if (values.json) console.log(JSON.stringify({ plan, ...view }, null, 2));
  else {
    for (const row of view.rows) {
      const covered = row.deviations.length > 0 ? `; covered by ${row.deviations.join(", ")}` : "";
      console.log(
        `${row.unit} / ${row.arm}: planned ${row.trials}, ran ${row.ran}, non-zero exit ${row.nonzero}, not started ${row.notStarted}${covered}`,
      );
    }
    console.log(
      `before the lock: ${view.beforeLock}; other plan hash: ${view.otherPlan}; unplanned: ${view.unplanned.length}`,
    );
  }
} else {
  fail(USAGE);
}
