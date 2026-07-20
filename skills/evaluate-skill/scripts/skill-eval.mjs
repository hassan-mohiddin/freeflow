#!/usr/bin/env node

import { runEvaluation } from "./lib/runner.mjs";
import { renderResult } from "./lib/view.mjs";

const commands = new Set(["run", "view"]);
const argv = process.argv.slice(2);
const [command] = argv;

function printUsage() {
  process.stdout.write(
    `Usage:
  skill-eval run <suite-or-group-path> [options]
  skill-eval view <result-id-or-directory> [options]

Commands:
  run    Execute selected evaluation groups
  view   Render selected stored evidence

Selectors:
  --group <id-or-position>
  --variant <baseline|candidate>

Paths:
  Definition paths resolve from the current working directory.
  Suite group references resolve relative to the suite file.
  Results are stored under <cwd>/.skill-eval/runs/<result-id>.
  view accepts a stored result ID or an explicit result directory.

Selection:
  No selectors choose every suite group and both variants.
  --group is invalid for a direct group definition or result.

Current run support:
  Description and explicit-body groups with prompt or ordered turns
  Working-tree or Git-backed ordered skills/context; optional fresh fixture copies
  Description tools: read; body tools: read, write, edit
  Deterministic reads, paths, changed paths, text, JSON, and factual comparisons
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
  let group = null;
  let variant = null;
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    const value = options[index + 1];
    if (option !== "--group" && option !== "--variant") throw new Error(`Unknown option: ${option}`);
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
    if (option === "--group") {
      if (group !== null) throw new Error("--group may be supplied only once");
      group = value;
    } else {
      if (variant !== null) throw new Error("--variant may be supplied only once");
      variant = value;
    }
    index += 1;
  }
  return { target, selectors: { group, variant } };
}

if (!command || command === "--help" || command === "-h") {
  printUsage();
} else if (!commands.has(command)) {
  fail(`Unknown command: ${command}`);
} else {
  try {
    const operation = parseOperation(argv.slice(1));
    if (command === "view") {
      process.stdout.write(await renderResult(operation.target, operation.selectors, { root: process.cwd() }));
    } else {
      const controller = new AbortController();
      const abort = () => controller.abort();
      process.once("SIGINT", abort);
      process.once("SIGTERM", abort);
      try {
        const result = await runEvaluation(operation.target, operation.selectors, {
          root: process.cwd(),
          signal: controller.signal,
        });
        process.stdout.write(`Result: ${result.id}\nPath: ${result.path}\nState: ${result.state}\n`);
        if (result.state !== "complete") process.exitCode = 1;
      } finally {
        process.removeListener("SIGINT", abort);
        process.removeListener("SIGTERM", abort);
      }
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }
}
