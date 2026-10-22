#!/usr/bin/env node
// Reads one or more freeflow-tool-use results and reports, per task: how often the work was done (the hidden tests),
// how often each tool check held (the tool Tool Execution means for the task, and the reported alternatives), and how
// many calls each tool got. With two results (before and after), it prints them side by side. The script tasks
// (suite-scripts.json, v0.9.0 only) add order facts read from the transcript, such as whether touch-map ran before
// the first edit; a task with no runs in any result given is left out of the table.
//
//   node .skill-eval/freeflow-tool-use/scripts/report.mjs <result> [<result>] [--results <dir>] [--json]
//
// A result is a result ID under <dir> (default .skill-eval/runs), or a path to a result or aggregate folder; an
// aggregate's trials are all read. Runs that did not complete, and runs held for transcript flags no one has cleared,
// are left out and counted.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { unclearedFlags } from "../../../skills/evaluate-behavior/scripts/lib/scan.mjs";
import { ALL_TASKS } from "./groups.mjs";

const ARM = "freeflow";
const COUNTED = ["bash", "bash_background", "monitor", "stop_background", "apply_patch", "edit", "write"];

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function trialDirectories(result, resultsDirectory) {
  const direct = (await stat(result).catch(() => null))?.isDirectory()
    ? path.resolve(result)
    : path.join(resultsDirectory, result);
  const aggregate = await readJson(path.join(direct, "aggregate.json"));
  if (aggregate === null) return [direct];
  return aggregate.trials.map((trial) => path.join(path.dirname(direct), trial.id));
}

function toolCalls(run) {
  if (Array.isArray(run.turns)) return run.turns.flatMap((turn) => turn.toolActivity ?? []);
  return run.toolActivity ?? [];
}

const matches = (call, matchers) =>
  call.completed === true &&
  call.isError !== true &&
  matchers.some(
    (matcher) =>
      call.toolName === matcher.tool &&
      (matcher.contains ?? []).every((text) => JSON.stringify(call.args ?? {}).includes(text)),
  );

/**
 * One order fact over a run's successful tool calls, in the order they ran: `before`, a call matching `first` came
 * before the first call matching `then`; `afterLast`, one came after the last call matching `then`. Null when no call
 * matched `then`, so the fact does not apply.
 */
export function orderFact(calls, fact) {
  const firsts = calls.flatMap((call, index) => (matches(call, fact.first) ? [index] : []));
  const thens = calls.flatMap((call, index) => (matches(call, fact.then) ? [index] : []));
  if (thens.length === 0) return null;
  if (firsts.length === 0) return false;
  return fact.mode === "before" ? firsts[0] < thens[0] : firsts.at(-1) > thens.at(-1);
}

/** Every usable run per task: its check states and its tool-call counts. */
export async function collect(result, resultsDirectory) {
  const tasks = Object.fromEntries(ALL_TASKS.map((task) => [task.id, []]));
  const skipped = [];
  for (const trial of await trialDirectories(result, resultsDirectory)) {
    for (const task of ALL_TASKS) {
      const groupDirectory = path.join(trial, "groups", task.id);
      const run = await readJson(path.join(groupDirectory, ARM, "run.json"));
      if (run === null) continue;
      if (run.state !== "complete") {
        skipped.push({ task: task.id, reason: run.state });
        continue;
      }
      const flags = await unclearedFlags(run, path.join(groupDirectory, ARM));
      if (flags.length > 0) {
        skipped.push({ task: task.id, reason: `held: ${flags.join(", ")}` });
        continue;
      }
      const grade = await readJson(path.join(groupDirectory, "deterministic-grade.json"));
      const checks = Object.fromEntries((grade?.checks ?? []).map((check) => [check.id, check.state]));
      const counts = Object.fromEntries(COUNTED.map((name) => [name, 0]));
      const calls = toolCalls(run);
      for (const call of calls) if (call.toolName in counts) counts[call.toolName] += 1;
      tasks[task.id].push({
        checks,
        counts,
        order: Object.fromEntries((task.order ?? []).map((fact) => [fact.id, orderFact(calls, fact)])),
        durationMs: run.metrics?.durationMs ?? null,
        cost: run.metrics?.cost ?? null,
      });
    }
  }
  return { tasks, skipped };
}

export function summarize({ tasks }) {
  return Object.fromEntries(
    ALL_TASKS.map((task) => {
      const runs = tasks[task.id];
      const rate = (id) => {
        const graded = runs.filter((run) => run.checks[id] === "pass" || run.checks[id] === "fail");
        return graded.length === 0
          ? null
          : { pass: graded.filter((run) => run.checks[id] === "pass").length, of: graded.length };
      };
      const ids = ["task", ...task.right.map((check) => check.id), ...task.also.map((check) => check.id)];
      const calls = Object.fromEntries(
        COUNTED.map((name) => [
          name,
          runs.length === 0 ? null : runs.reduce((sum, run) => sum + run.counts[name], 0) / runs.length,
        ]),
      );
      const right = runs.filter((run) => task.right.every((check) => run.checks[check.id] === "pass")).length;
      const order = Object.fromEntries(
        (task.order ?? []).map((fact) => {
          const applied = runs.filter((run) => run.order[fact.id] !== null);
          return [
            fact.id,
            applied.length === 0
              ? null
              : { pass: applied.filter((run) => run.order[fact.id]).length, of: applied.length },
          ];
        }),
      );
      return [
        task.id,
        {
          runs: runs.length,
          rightTool: runs.length === 0 ? null : { pass: right, of: runs.length },
          checks: Object.fromEntries(ids.map((id) => [id, rate(id)])),
          order,
          meanCalls: calls,
        },
      ];
    }),
  );
}

const show = (value) => (value === null ? "-" : `${value.pass}/${value.of}`);

async function main(argv) {
  const results = [];
  let resultsDirectory = path.join(process.cwd(), ".skill-eval", "runs");
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--results") resultsDirectory = path.resolve(argv[++index]);
    else if (argv[index] === "--json") json = true;
    else results.push(argv[index]);
  }
  if (results.length === 0) {
    process.stderr.write("usage: report.mjs <result> [<result>] [--results <dir>] [--json]\n");
    return 2;
  }
  const labels = results.length === 2 ? ["before", "after"] : results.map((_, index) => `r${index + 1}`);
  const collected = await Promise.all(results.map((result) => collect(result, resultsDirectory)));
  const summaries = collected.map(summarize);
  if (json) {
    const output = summaries.map((tasks, index) => ({
      label: labels[index],
      result: results[index],
      tasks,
      skipped: collected[index].skipped,
    }));
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return 0;
  }
  const lines = [];
  for (const task of ALL_TASKS) {
    if (summaries.every((summary) => summary[task.id].runs === 0)) continue;
    lines.push(`${task.id} (${task.kind}): right tool = ${task.right.map((check) => check.id).join(" + ")}`);
    for (const [index, summary] of summaries.entries()) {
      const entry = summary[task.id];
      const checks = Object.entries(entry.checks)
        .map(([id, value]) => `${id} ${show(value)}`)
        .join(", ");
      const calls = Object.entries(entry.meanCalls)
        .filter(([, mean]) => mean !== null && mean > 0)
        .map(([name, mean]) => `${name} ${mean.toFixed(1)}`)
        .join(", ");
      const order = Object.entries(entry.order)
        .map(([id, value]) => `${id} ${show(value)}`)
        .join(", ");
      lines.push(
        `  ${labels[index]}: ${entry.runs} runs; right tool ${show(entry.rightTool)}; ${checks}${order ? `; ${order}` : ""}; calls per run: ${calls || "-"}`,
      );
    }
  }
  for (const [index, { skipped }] of collected.entries()) {
    if (skipped.length > 0) {
      lines.push(`${labels[index]}: left out ${skipped.map((entry) => `${entry.task} (${entry.reason})`).join("; ")}`);
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
