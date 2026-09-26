#!/usr/bin/env node

import { runEvaluation } from "./lib/runner.mjs";
import { reviewResult } from "./lib/review.mjs";
import { runTrials } from "./lib/trials.mjs";
import { renderResult } from "./lib/view.mjs";

const OPTIONS = {
  run: ["--group", "--variant", "--trials", "--max-cost"],
  view: ["--group", "--variant"],
  review: ["--group", "--model", "--thinking"],
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

Review options:
  --model <provider/model>   Required reviewer model
  --thinking <level>         Optional reviewer thinking level

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
  const parsed = { group: null, variant: null, trials: null, maxCost: null, model: null, thinking: null };
  const keys = {
    "--group": "group",
    "--variant": "variant",
    "--trials": "trials",
    "--max-cost": "maxCost",
    "--model": "model",
    "--thinking": "thinking",
  };
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const value = options[index + 1];
    if (!allowed.includes(option)) throw new Error(`Unknown option: ${option}`);
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
  if (command === "review" && parsed.model === null) throw new Error("skill-eval review requires --model");
  return {
    target,
    selectors: { group: parsed.group, variant: parsed.variant },
    trials,
    maxCost,
    model: parsed.model,
    thinking: parsed.thinking,
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

async function run(operation) {
  const root = process.cwd();
  await withCancellation(async (signal) => {
    if (operation.trials === 1) {
      const budget = operation.maxCost === null ? null : { maxCost: operation.maxCost, spent: 0, exhausted: false };
      const result = await runEvaluation(operation.target, operation.selectors, { root, signal, budget });
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
