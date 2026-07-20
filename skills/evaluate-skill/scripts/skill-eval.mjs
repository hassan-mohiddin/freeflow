#!/usr/bin/env node

import { runEvaluation } from "./lib/runner.mjs";
import { renderResult } from "./lib/view.mjs";

const commands = new Set(["run", "view"]);
const argv = process.argv.slice(2);
const [command] = argv;

function printUsage() {
  process.stdout.write(
    `Usage: skill-eval <run|view> <suite-or-result> [options]\n\nCommands:\n  run <suite-or-group>   Run selected evaluation groups\n  view <result-id>       Render selected stored evidence\n\nSelectors:\n  --group <id-or-position>\n  --variant <baseline|candidate>\n\nCurrent run support:\n  One-shot description prompts with working-tree skills, no fixture/context, and the read tool only\n`,
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
