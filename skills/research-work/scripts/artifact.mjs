#!/usr/bin/env node
// Create and check Research Work's artifacts. The formats are defined in references/artifacts.md.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { KINDS_OF_ARTIFACT, kindOf, ledgerRows, searchCounts, skeleton, validate } from "./lib/formats.mjs";

const USAGE = [
  "Usage: artifact.mjs init <kind> <path> --title <title> --owner <owner> [--rigor check|study|publication]",
  "       artifact.mjs validate <path> [--sources <source ledger>] [--json]",
  "       artifact.mjs counts <search ledger .jsonl> [--json]",
  "",
  `Kinds: ${Object.keys(KINDS_OF_ARTIFACT).join(", ")}`,
].join("\n");

function fail(message) {
  console.error(message);
  process.exit(2);
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      title: { type: "string" },
      owner: { type: "string" },
      rigor: { type: "string", default: "study" },
      sources: { type: "string" },
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
const [command, ...rest] = positionals;

if (command === "init") {
  const [kind, path] = rest;
  if (!(kind in KINDS_OF_ARTIFACT) || !path) fail(USAGE);
  if (kind !== "search-ledger" && (!values.title || !values.owner)) fail("init needs --title and --owner");
  if (existsSync(path)) fail(`${path} already exists; init never overwrites`);
  let text;
  try {
    text = skeleton(kind, { title: values.title, owner: values.owner, rigor: values.rigor });
  } catch (error) {
    fail(error.message);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`Created ${kind}: ${path}`);
} else if (command === "validate") {
  const [path] = rest;
  if (!path || rest.length !== 1) fail(USAGE);
  const text = read(path);
  const kind = kindOf(path, text);
  if (!kind) fail(`${path}: no known Type in its header, and not a .jsonl search ledger`);
  if (values.sources && kind !== "claims-register") fail("--sources applies only to a claims register");
  const result = validate(kind, text, values.sources ? { ledger: ledgerRows(read(values.sources)) } : {});
  if (values.json) console.log(JSON.stringify({ path, ...result }, null, 2));
  else {
    console.log(`${path}: ${kind}, ${result.valid ? "valid" : `${result.problems.length} problem(s)`}`);
    for (const problem of result.problems) console.log(`  problem: ${problem}`);
    if (kind === "claims-register" && !values.sources)
      console.log("  not checked: levels against the source ledger (pass --sources)");
  }
  process.exit(result.valid ? 0 : 1);
} else if (command === "counts") {
  const [path] = rest;
  if (!path || !path.endsWith(".jsonl")) fail(USAGE);
  const result = searchCounts(read(path));
  if (values.json) console.log(JSON.stringify({ path, ...result }, null, 2));
  else {
    const { total } = result;
    console.log(
      `${path}: ${total.hits} hits; included ${total.included}, excluded ${total.excluded}, duplicate ${total.duplicate}, unscreened ${total.unscreened}`,
    );
    for (const [id, query] of Object.entries(result.queries)) {
      console.log(
        `  ${id} ${query.database} ${query.date}: included ${query.included}, excluded ${query.excluded}, duplicate ${query.duplicate}, unscreened ${query.unscreened} (${query.query})`,
      );
    }
    for (const problem of result.problems) console.log(`  problem: ${problem}`);
  }
  process.exit(result.problems.length === 0 ? 0 : 1);
} else {
  fail(USAGE);
}
