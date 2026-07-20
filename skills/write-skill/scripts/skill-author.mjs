#!/usr/bin/env node

import { initSkill, inspectSkill, SkillAuthorError, validateSkill } from "./lib/skill-author.mjs";

const commands = new Set(["init", "validate", "inspect"]);

function printUsage() {
  process.stdout.write(
    `Usage: skill-author <init|validate|inspect> [options]\n\nCommands:\n  init <directory> --name <name> --description <text>\n      init creates a minimal SKILL.md and refuses to overwrite one\n  validate <directory> [--package-root <directory>]\n      validate checks structure and recursive resource containment\n  inspect <directory> [--package-root <directory>]\n      inspect reports factual inventory plus validation findings\n\nOutput:\n  Commands emit JSON. Invalid structure still emits JSON and exits nonzero.\n  Command errors emit structured error JSON.\n  Package root defaults to the nearest package.json ancestor, then the skill parent.\n\nFrontmatter:\n  Validation supports flat plain-string or JSON-compatible double-quoted scalars.\n  Double-quote values when punctuation, numbers, booleans, or null-like text could be ambiguous.\n`,
  );
}

function fail(code, message, exitCode = 2) {
  throw new SkillAuthorError(code, message, exitCode);
}

function parseOptions(args, allowedOptions) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    if (!allowedOptions.has(argument)) {
      fail("unknown-option", `Unknown option: ${argument}`);
    }
    if (Object.hasOwn(options, argument)) {
      fail("duplicate-option", `Option may be supplied once: ${argument}`);
    }

    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("missing-option-value", `Option requires a value: ${argument}`);
    }
    options[argument] = value;
    index += 1;
  }

  return { positionals, options };
}

async function run(command, args) {
  if (command === "init") {
    const { positionals, options } = parseOptions(args, new Set(["--name", "--description"]));
    if (positionals.length !== 1) {
      fail("invalid-arguments", "init requires exactly one skill directory");
    }
    if (!Object.hasOwn(options, "--name") || !Object.hasOwn(options, "--description")) {
      fail("invalid-arguments", "init requires --name and --description");
    }
    return initSkill({
      directory: positionals[0],
      name: options["--name"],
      description: options["--description"],
    });
  }

  if (command === "validate" || command === "inspect") {
    const { positionals, options } = parseOptions(args, new Set(["--package-root"]));
    if (positionals.length !== 1) {
      fail("invalid-arguments", `${command} requires exactly one skill directory`);
    }
    const input = { directory: positionals[0], packageRoot: options["--package-root"] };
    return command === "validate" ? validateSkill(input) : inspectSkill(input);
  }

  fail("unknown-command", `Unknown command: ${command}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  if (!commands.has(command)) {
    fail("unknown-command", `Unknown command: ${command}`);
  }

  const result = await run(command, args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "invalid") process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  const knownError = error instanceof SkillAuthorError;
  const result = {
    command: process.argv[2] ?? null,
    status: "error",
    error: {
      code: knownError ? error.code : "unexpected-error",
      message: knownError ? error.message : "Skill Author failed unexpectedly",
    },
  };
  process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = knownError ? error.exitCode : 1;
}
