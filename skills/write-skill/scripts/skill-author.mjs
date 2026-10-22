#!/usr/bin/env node

import { compareGuidance, compareMarkdown } from "./lib/compare.mjs";
import { DEFAULT_THRESHOLD, findSimilarFiles } from "./lib/similarity.mjs";
import { initSkill, inspectSkill, SkillAuthorError, validateSkill } from "./lib/skill-author.mjs";

const commands = new Set(["init", "validate", "inspect", "similarity", "compare"]);

function printUsage() {
  process.stdout.write(
    `Usage: skill-author <init|validate|inspect|similarity> [options]\n       skill-author compare [<base-ref> [<new-ref>] | --base <folder> [<folder>]] [options]\n\nCommands:\n  init <directory> --name <name> --description <text>\n      init creates a minimal SKILL.md and refuses to overwrite one\n  validate <directory> [--package-root <directory>] [--routing-map <file>]\n      validate checks structure and recursive resource containment, reports link cycles among\n      the Markdown files the skill reaches, and with --routing-map checks the skill's row\n  inspect <directory> [--package-root <directory>]\n      inspect reports factual inventory plus validation findings\n  similarity <directory> [--threshold <0-1>]\n      similarity reports near-duplicate Markdown files by shared word sequences (default ${DEFAULT_THRESHOLD})\n  compare [<base-ref> [<new-ref>]] [--paths <path>...] [--deleted-only] [--verdicts <file>] [--markdown]\n      compare reports what changed model-facing Markdown at <base-ref> (default: the merge-base with\n      the default branch) no longer says at <new-ref> (default: the working tree, uncommitted edits\n      included), and exits nonzero while a rule-like unmatched unit has no verdict\n  compare --base <folder> [<folder>] [options]\n      compare against a copy of the text kept outside Git (default: the current folder)\n\nOutput:\n  Commands emit JSON. Invalid structure still emits JSON and exits nonzero.\n  compare --markdown prints a readable report instead.\n  Command errors emit structured error JSON.\n  Package root defaults to the nearest package.json ancestor, then the skill parent.\n\nFrontmatter:\n  Validation supports flat plain-string or JSON-compatible double-quoted scalars.\n  Double-quote values when punctuation, numbers, booleans, or null-like text could be ambiguous.\n`,
  );
}

function fail(code, message, exitCode = 2) {
  throw new SkillAuthorError(code, message, exitCode);
}

// Options take one value, except flags (no value) and lists (every following argument up to the next option).
function parseOptions(args, allowedOptions, { flags = new Set(), lists = new Set() } = {}) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }

    if (!allowedOptions.has(argument) && !flags.has(argument) && !lists.has(argument)) {
      fail("unknown-option", `Unknown option: ${argument}`);
    }
    if (Object.hasOwn(options, argument)) {
      fail("duplicate-option", `Option may be supplied once: ${argument}`);
    }
    if (flags.has(argument)) {
      options[argument] = true;
      continue;
    }
    if (lists.has(argument)) {
      const values = [];
      while (index + 1 < args.length && !args[index + 1].startsWith("--")) values.push(args[(index += 1)]);
      if (values.length === 0) fail("missing-option-value", `Option requires a value: ${argument}`);
      options[argument] = values;
      continue;
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
    const allowed = command === "validate" ? ["--package-root", "--routing-map"] : ["--package-root"];
    const { positionals, options } = parseOptions(args, new Set(allowed));
    if (positionals.length !== 1) {
      fail("invalid-arguments", `${command} requires exactly one skill directory`);
    }
    const input = { directory: positionals[0], packageRoot: options["--package-root"] };
    return command === "validate"
      ? validateSkill({ ...input, routingMap: options["--routing-map"] })
      : inspectSkill(input);
  }

  if (command === "similarity") {
    const { positionals, options } = parseOptions(args, new Set(["--threshold"]));
    if (positionals.length !== 1) {
      fail("invalid-arguments", "similarity requires exactly one directory");
    }
    let threshold = DEFAULT_THRESHOLD;
    if (Object.hasOwn(options, "--threshold")) {
      threshold = Number(options["--threshold"]);
      if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
        fail("invalid-threshold", "--threshold must be a number greater than 0 and at most 1");
      }
    }
    return findSimilarFiles({ directory: positionals[0], threshold });
  }

  if (command === "compare") {
    const { positionals, options } = parseOptions(args, new Set(["--base", "--verdicts"]), {
      flags: new Set(["--deleted-only", "--markdown"]),
      lists: new Set(["--paths"]),
    });
    const folder = options["--base"] ?? null;
    if (positionals.length > (folder === null ? 2 : 1)) {
      fail(
        "invalid-arguments",
        folder === null
          ? "compare takes at most a base ref and a new ref"
          : "compare --base takes at most one folder to compare",
      );
    }
    const result = await compareGuidance({
      base: folder === null ? (positionals[0] ?? null) : null,
      next: folder === null ? (positionals[1] ?? null) : null,
      baseFolder: folder,
      directory: folder === null ? null : (positionals[0] ?? null),
      paths: options["--paths"] ?? null,
      deletedOnly: options["--deleted-only"] === true,
      verdicts: options["--verdicts"] ?? null,
    });
    return options["--markdown"] ? { ...result, markdown: true } : result;
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
  process.stdout.write(result.markdown ? compareMarkdown(result) : `${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "invalid" || result.status === "unresolved") process.exitCode = 1;
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
