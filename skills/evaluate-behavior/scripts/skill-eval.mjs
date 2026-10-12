#!/usr/bin/env node

import { realpath } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";

import { loadDefinition, selectDefinition } from "./lib/definitions.mjs";
import "./lib/metrics.mjs";
import { runEvaluation } from "./lib/runner.mjs";
import { calibrateJudges, reviewResult, reviewRubric } from "./lib/review.mjs";
import { runTrials } from "./lib/trials.mjs";
import { renderResult } from "./lib/view.mjs";
import { writeHtml } from "./lib/view-html.mjs";

const OPTIONS = {
  run: ["--group", "--variant", "--trials", "--max-cost", "--yes", "--dry-run"],
  view: ["--group", "--variant", "--html"],
  review: [
    "--group",
    "--model",
    "--thinking",
    "--configuration",
    "--swap",
    "--swap-sample",
    "--limit",
    "--rubric",
    "--calibrate",
  ],
};
const argv = process.argv.slice(2);
const [command] = argv;

function printUsage() {
  process.stdout.write(
    `Usage:
  skill-eval run <suite-or-group-path> [options]
  skill-eval view <result-id-or-directory> [options]
  skill-eval review <result-id-or-directory> --model <provider/model> [options]
  skill-eval review <result-or-aggregate-id> --rubric [options]
  skill-eval review <result-or-aggregate-id> --calibrate <labels.json>

Commands:
  run     Execute selected evaluation groups
  view    Render selected stored evidence or a trial aggregate
  review  Record an advisory, arm-blind model answer to each group's review questions

Selectors:
  --group <id-or-position>
  --variant <baseline|candidate>        (run, view) or any other arm the selected groups declare

Run options:
  --trials <n>        Run n independent complete invocations and record an aggregate
                      (a suite's decision always aggregates; its trials schedule sets n)
  --max-cost <total>  Stop starting subjects once host-reported cost reaches the total
  --yes               Start without asking (the plan is printed either way; scripts never ask)
  --dry-run           Allow uncommitted inputs; the result is marked as a dry run and supports no claim

Review options:
  --model <provider/model>   Required reviewer model
  --thinking <level>         Optional reviewer thinking level
  --configuration <file>     A schema 2 configuration file for the reviewer: its model, host extensions and settings
  --swap                     Review again with the run labels in reverse order, and record agreement
  --swap-sample <fraction>   Swap only on a random sample of the groups (the fraction, rounded up), recorded
  --rubric                   Judge each run alone, blind to its arm, against its group's rubric; the group's
                             judges, or --model, answer; judged evidence is stored beside each run; an
                             aggregate judges every trial
  --calibrate <labels.json>  Score judges against hand labels ({ "<run path>": { "<dimension>": answer } })
                             and record each judge configuration's calibration in the target's judged evidence
  --limit <name>=<chars>     Show the reviewer more or less: response, argument, file or materials (repeatable;
                             defaults 8000, 300, 20000, 60000). Anything cut is recorded as a contract gap.

Paths:
  Definition paths resolve from the current working directory.
  Suite group references resolve relative to the suite file.
  Results are stored under <cwd>/.skill-eval/runs/<result-id>.
  view accepts a stored result or aggregate ID or an explicit directory.

Selection:
  No selectors choose every suite group and every arm.
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
    swapSample: null,
    calibrate: null,
    html: null,
  };
  let swap = false;
  let rubric = false;
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
    "--swap-sample": "swapSample",
    "--calibrate": "calibrate",
    "--html": "html",
  };
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const value = options[index + 1];
    if (!allowed.includes(option)) throw new Error(`Unknown option: ${option}`);
    if (option === "--swap") {
      swap = true;
      continue;
    }
    if (option === "--rubric") {
      rubric = true;
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
  // Null when omitted: one trial, unless the suite's decision schedules its own.
  let trials = null;
  if (parsed.trials !== null) {
    trials = Number(parsed.trials);
    if (!/^\d+$/.test(parsed.trials) || trials < 1) throw new Error("--trials must be a positive integer");
  }
  let maxCost = null;
  if (parsed.maxCost !== null) {
    maxCost = Number(parsed.maxCost);
    if (!Number.isFinite(maxCost) || maxCost <= 0) throw new Error("--max-cost must be a positive number");
  }
  const swapSample = parsed.swapSample === null ? null : Number(parsed.swapSample);
  if (swapSample !== null && !(swapSample > 0 && swapSample <= 1)) {
    throw new Error("--swap-sample must be a fraction greater than 0 and at most 1");
  }
  if ([rubric, parsed.calibrate !== null, swap || swapSample !== null].filter(Boolean).length > 1) {
    throw new Error("--rubric, --calibrate and swapping are separate review modes; use one");
  }
  // A rubric's judges may be declared by its group, and calibration starts no judge.
  const needsModel = command === "review" && !rubric && parsed.calibrate === null;
  if (needsModel && parsed.model === null && parsed.configuration === null) {
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
    html: parsed.html,
    swap,
    swapSample,
    rubric,
    calibrate: parsed.calibrate,
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
 * Returns null when not confirmed, else the selected suite's decision rule (null when it declares none).
 */
async function planRun(operation, root) {
  // Resolved the way the runner resolves it, so the plan loads exactly what will run.
  const definitionPath = await realpath(path.resolve(root, operation.target));
  const definition = await loadDefinition(definitionPath, { root });
  const selection = selectDefinition(definition, operation.selectors);
  const decision = definition.kind === "suite" ? (definition.decision ?? null) : null;
  const schedule = decision?.trials ?? null;
  if (schedule !== null && operation.trials !== null && operation.trials !== schedule.initial) {
    throw new Error(
      `the suite's decision schedules ${schedule.initial} initial trials; omit --trials or set it to ${schedule.initial}`,
    );
  }
  const trials = schedule?.initial ?? operation.trials ?? 1;
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
  let counts = `${groups} group${groups === 1 ? "" : "s"}, ${arms} arm${arms === 1 ? "" : "s"}, ${trials} trial${trials === 1 ? "" : "s"}`;
  let subjects = `${arms * trials}`;
  if (schedule !== null && schedule.max > schedule.initial) {
    // Adaptive rounds add trials only to undecided cases, so the count is a range up to every case at max.
    counts += `, adaptive up to ${schedule.max} per case`;
    subjects += ` to ${arms * schedule.max}`;
  }
  let line = `Plan: ${subjects} subjects (${counts}); models: ${[...models].join(", ")}`;
  if (freeflow.size > 0) line += `; Freeflow builds: ${[...freeflow].join(", ")}`;
  if (extensions.size > 0) line += `; extensions: ${[...extensions].join(", ")}`;
  if (operation.dryRun) line += "; dry run";
  process.stdout.write(`${line}\n`);
  if (operation.yes || !process.stdin.isTTY || !process.stdout.isTTY) return { decision };
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await readline.question("Start? [y/N] ");
  readline.close();
  return /^y(es)?$/i.test(answer.trim()) ? { decision } : null;
}

async function run(operation) {
  const root = process.cwd();
  const plan = await planRun(operation, root);
  if (plan === null) {
    process.stdout.write("Not started.\n");
    process.exitCode = 1;
    return;
  }
  await withCancellation(async (signal) => {
    // A suite's decision is reached over an aggregate, so it always runs as trials, even a single one.
    if (plan.decision === null && (operation.trials ?? 1) === 1) {
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
  if (operation.calibrate !== null) return calibrate(operation);
  if (operation.rubric) return judge(operation);
  const outcome = await withCancellation((signal) =>
    reviewResult(operation.target, operation.selectors, {
      root: process.cwd(),
      signal,
      model: operation.model,
      thinking: operation.thinking,
      configuration: operation.configuration,
      swap: operation.swap,
      swapSample: operation.swapSample,
      limits: operation.limits,
    }),
  );
  for (const group of outcome.groups) {
    process.stdout.write(`Review ${group.id}: ${group.state}${group.artifact ? ` (${group.artifact})` : ""}\n`);
  }
  if (outcome.groups.some((group) => group.state === "review-error")) process.exitCode = 1;
}

function printAggregate(aggregate) {
  if (aggregate === null) return;
  process.stdout.write(`Aggregate: rebuilt; claim: ${aggregate.claim ?? "none"}\n`);
}

async function judge(operation) {
  const outcome = await withCancellation((signal) =>
    reviewRubric(operation.target, operation.selectors, {
      root: process.cwd(),
      signal,
      model: operation.model,
      thinking: operation.thinking,
      configuration: operation.configuration,
      limits: operation.limits,
    }),
  );
  for (const entry of outcome.groups) {
    const where = entry.artifact ? ` (${entry.artifact})` : entry.reason ? ` (${entry.reason})` : "";
    process.stdout.write(`Judged ${entry.id}${entry.arm ? ` ${entry.arm}` : ""}: ${entry.state}${where}\n`);
  }
  printAggregate(outcome.aggregate);
  if (outcome.groups.some((entry) => entry.state === "judge-error")) process.exitCode = 1;
}

async function calibrate(operation) {
  const outcome = await calibrateJudges(operation.target, operation.calibrate, { root: process.cwd() });
  const number = (value) => (value === null ? "-" : value.toFixed(2));
  for (const calibration of outcome.calibrations) {
    const name = `${calibration.model}${calibration.thinking ? ` (${calibration.thinking})` : ""}`;
    const dimensions = Object.entries(calibration.dimensions).map(
      ([id, { items, agreement, kappa }]) =>
        `${id}: agreement=${number(agreement)} kappa=${number(kappa)} over ${items}`,
    );
    process.stdout.write(`Calibration ${name} [${calibration.configuration}]: ${dimensions.join("; ")}\n`);
  }
  process.stdout.write(`Judged grades updated: ${outcome.updated}\n`);
  printAggregate(outcome.aggregate);
}

if (!command || command === "--help" || command === "-h") {
  printUsage();
} else if (Object.hasOwn(OPTIONS, command)) {
  try {
    const operation = parseOperation(argv.slice(1));
    if (command === "view" && operation.html !== null) {
      const written = await writeHtml(operation.target, operation.html, {
        root: process.cwd(),
        selectors: operation.selectors,
      });
      process.stdout.write(`Wrote ${written}\n`);
    } else if (command === "view") {
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
