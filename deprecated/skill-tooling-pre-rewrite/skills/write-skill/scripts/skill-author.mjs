#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initSkill, inspectSkill, validateSkill } from "./lib/skill-author-core.mjs";

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {};
  const positionals = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2).replaceAll("-", "_");
    if (rest[index + 1] === undefined || rest[index + 1].startsWith("--")) options[key] = true;
    else {
      options[key] = rest[index + 1];
      index += 1;
    }
  }
  return { command, options, positionals };
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options, positionals } = parse(argv);
  if (command === "init") {
    const name = options.name ?? positionals[0];
    const root = options.root ?? positionals[1] ?? process.cwd();
    if (!name) throw new Error("init requires a skill name");
    output(await initSkill({ name, root: resolve(root), description: options.description }));
    return 0;
  }
  if (command === "validate") {
    const path = options.path ?? positionals[0];
    if (!path) throw new Error("validate requires a skill path");
    const result = await validateSkill(path);
    output(result);
    return result.valid ? 0 : 1;
  }
  if (command === "inspect") {
    const path = options.path ?? positionals[0];
    if (!path) throw new Error("inspect requires a skill path");
    output(await inspectSkill(path));
    return 0;
  }
  process.stdout.write("skill-author.mjs init|validate|inspect\n");
  return command ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`skill-author: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
