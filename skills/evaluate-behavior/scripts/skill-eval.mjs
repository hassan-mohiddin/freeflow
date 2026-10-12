#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { loadDefinition, selectDefinition } from "./lib/definitions.mjs";
import { runEvaluation } from "./lib/runner.mjs";
import { reviewResult } from "./lib/review.mjs";
import { runTrials } from "./lib/trials.mjs";
import { renderResult } from "./lib/view.mjs";

const OPTIONS = {
  run: ["--group", "--variant", "--trials", "--max-cost", "--yes", "--dry-run"],
  view: ["--group", "--variant"],
  review: ["--group", "--model", "--thinking", "--configuration", "--swap", "--limit"],
};
const argv = process.argv.slice(2);
const [command] = argv;

function printUsage() {
  process.stdout.write(
    `Usage:
  skill-eval run <suite-or-group-path> [options]
  skill-eval view <result-id-or-directory> [options]
  skill-eval review <result-id-or-directory> --model <provider/model> [options]

Commands:
  run     Execute selected evaluation groups
  view    Render selected stored evidence or a trial aggregate
  review  Record an advisory, variant-blind model answer to each group's review questions

Selectors:
  --group <id-or-position>
  --variant <baseline|candidate>        (run, view)

Run options:
  --trials <n>        Run n independent complete invocations and record an aggregate
  --max-cost <total>  Stop starting subjects once host-reported cost reaches the total
  --yes               Start without asking (the plan is printed either way; scripts never ask)
  --dry-run           Allow uncommitted inputs; the result is marked as a dry run and supports no claim

Review options:
  --model <provider/model>   Required reviewer model
  --thinking <level>         Optional reviewer thinking level
  --configuration <file>     A schema 2 configuration file for the reviewer: its model, host extensions and settings
  --swap                     Review again with Run A and Run B swapped, and record agreement
  --limit <name>=<chars>     Show the reviewer more or less: response, argument, file or materials (repeatable;
                             defaults 8000, 300, 20000, 60000). Anything cut is recorded as a contract gap.

Paths:
  Definition paths resolve from the current working directory.
  Suite group references resolve relative to the suite file.
  Results are stored under <cwd>/.skill-eval/runs/<result-id>.
  view accepts a stored result or aggregate ID or an explicit directory.

Selection:
  No selectors choose every suite group and both variants.
  --group is invalid for a direct group definition or result.

Current run support:
  Description and explicit-body groups with prompt or ordered turns
  Working-tree or Git-backed ordered skills/context; optional fresh fixture copies
  Description tools: read; body tools: read, write, edit, run_command for declared commands, or declared extension tools
  Runtime profiles: Pi hosts, isolated or host system prompt, ordered immutable extension bundles, environment overrides
  Deterministic reads, paths, changed paths, text, JSON, tool calls, context observations, and factual comparisons
  Ordered suites run serially and continue after isolated variant, group, or post-processing failures
  Grade-first views show compact criterion details, usage, and result-relative artifact paths
`,
  );
}

function fail(message, exitCode = 2) {
  process.stderr.write(`${message}\n`);
  process.exitCode = exitCode;
}

function parseOperation(values) {
  const [target, ...options] = values;
  if (!target) throw new Error(`skill-eval ${command} requires a target`);
  const allowed = OPTIONS[command];
  const parsed = {
    group: null,
    variant: null,
    trials: null,
    maxCost: null,
    model: null,
    thinking: null,
    configuration: null,
  };
  let swap = false;
  const limits = {};
  let yes = false;
  let dryRun = false;
  const keys = {
    "--group": "group",
    "--variant": "variant",
    "--trials": "trials",
    "--max-cost": "maxCost",
    "--model": "model",
    "--configuration": "configuration",
    "--thinking": "thinking",
  };
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const value = options[index + 1];
    if (!allowed.includes(option)) throw new Error(`Unknown option: ${option}`);
    if (option === "--swap") {
      swap = true;
      continue;
    }
    if (option === "--limit") {
      const [, name, chars] = /^([a-z]+)=(\d+)$/.exec(value ?? "") ?? [];
      if (!name) throw new Error("--limit requires <name>=<chars>, such as file=40000");
      if (Object.hasOwn(limits, name)) throw new Error(`--limit ${name} may be supplied only once`);
      limits[name] = Number(chars);
      index += 1;
      continue;
    }
    if (option === "--yes") {
      yes = true;
      continue;
    }
    if (option === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
    const key = keys[option];
    if (parsed[key] !== null) throw new Error(`${option} may be supplied only once`);
    parsed[key] = value;
    index += 1;
  }
  let trials = 1;
  if (parsed.trials !== null) {
    trials = Number(parsed.trials);
    if (!/^\d+$/.test(parsed.trials) || trials < 1) throw new Error("--trials must be a positive integer");
  }
  let maxCost = null;
  if (parsed.maxCost !== null) {
    maxCost = Number(parsed.maxCost);
    if (!Number.isFinite(maxCost) || maxCost <= 0) throw new Error("--max-cost must be a positive number");
  }
  if (command === "review" && parsed.model === null && parsed.configuration === null) {
    throw new Error("skill-eval review requires --model or --configuration");
  }
  return {
    target,
    selectors: { group: parsed.group, variant: parsed.variant },
    trials,
    maxCost,
    model: parsed.model,
    thinking: parsed.thinking,
    configuration: parsed.configuration,
    swap,
    limits,
    yes,
    dryRun,
  };
}

async function withCancellation(run) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    return await run(controller.signal);
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

function printResult(result) {
  process.stdout.write(`Result: ${result.id}\nPath: ${result.path}\nState: ${result.state}\n`);
}

/**
 * What a run will start, from the definition alone: subjects, the models they use, and any Freeflow builds.
 * Printed before anything starts; an interactive terminal is asked to confirm unless --yes was given.
 */
async function planRun(operation, root) {
  // Resolved the way the runner resolves it, so the plan loads exactly what will run.
  const definitionPath = await realpath(path.resolve(root, operation.target));
  const selection = selectDefinition(await loadDefinition(definitionPath, { root }), operation.selectors);
  let arms = 0;
  const models = new Set();
  const freeflow = new Set();
  const extensions = new Set();
  for (const { group, variants } of selection.groups) {
    for (const [arm, state] of Object.entries(variants)) {
      if (state !== "selected") continue;
      arms += 1;
      const model = group.variants[arm].model;
      models.add(model ? `${model.model}${model.thinking ? ` (${model.thinking})` : ""}` : "host default");
      if (group.variants[arm].freeflow) freeflow.add(group.variants[arm].freeflow.source.ref);
      for (const extension of group.variants[arm].hostExtensions ?? []) {
        extensions.add(`${extension.package}@${extension.version}`);
      }
    }
  }
  const groups = selection.groups.length;
  const counts = `${groups} group${groups === 1 ? "" : "s"}, ${arms} arm${arms === 1 ? "" : "s"}, ${operation.trials} trial${operation.trials === 1 ? "" : "s"}`;
  let line = `Plan: ${arms * operation.trials} subjects (${counts}); models: ${[...models].join(", ")}`;
  if (freeflow.size > 0) line += `; Freeflow builds: ${[...freeflow].join(", ")}`;
  if (extensions.size > 0) line += `; extensions: ${[...extensions].join(", ")}`;
  if (operation.dryRun) line += "; dry run";
  process.stdout.write(`${line}\n`);
  if (operation.yes || !process.stdin.isTTY || !process.stdout.isTTY) return true;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question("Start? [y/N] ");
  readline.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function run(operation) {
  const root = process.cwd();
  if (!(await planRun(operation, root))) {
    process.stdout.write("Not started.\n");
    process.exitCode = 1;
    return;
  }
  await withCancellation(async (signal) => {
    if (operation.trials === 1) {
      const budget = operation.maxCost === null ? null : { maxCost: operation.maxCost, spent: 0, exhausted: false };
      const result = await runEvaluation(operation.target, operation.selectors, {
        root,
        signal,
        budget,
        dryRun: operation.dryRun,
      });
      printResult(result);
      if (result.state !== "complete") process.exitCode = 1;
      return;
    }
    const aggregate = await runTrials(operation.target, operation.selectors, {
      root,
      signal,
      trials: operation.trials,
      maxCost: operation.maxCost,
      onTrial: printResult,
      dryRun: operation.dryRun,
    });
    process.stdout.write(`Aggregate: ${aggregate.id}\nPath: ${aggregate.path}\nState: ${aggregate.state}\n`);
    if (aggregate.state !== "complete") process.exitCode = 1;
  });
}

async function review(operation) {
  const outcome = await withCancellation((signal) =>
    reviewResult(operation.target, operation.selectors, {
      root: process.cwd(),
      signal,
      model: operation.model,
      thinking: operation.thinking,
      configuration: operation.configuration,
      swap: operation.swap,
      limits: operation.limits,
    }),
  );
  for (const group of outcome.groups) {
    process.stdout.write(`Review ${group.id}: ${group.state}${group.artifact ? ` (${group.artifact})` : ""}\n`);
  }
  if (outcome.groups.some((group) => group.state === "review-error")) process.exitCode = 1;
}

if (!command || command === "--help" || command === "-h") {
  printUsage();
} else if (Object.hasOwn(OPTIONS, command)) {
  try {
    const operation = parseOperation(argv.slice(1));
    if (command === "view") {
      process.stdout.write(await renderResult(operation.target, operation.selectors, { root: process.cwd() }));
    } else if (command === "review") {
      await review(operation);
    } else {
      await run(operation);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }
} else {
  fail(`Unknown command: ${command}`);
}
