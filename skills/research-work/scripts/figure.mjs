#!/usr/bin/env node
// Draw a figure as SVG from a JSON spec and the data file it names. Run it through a receipt so the outline can show
// the figure came from its data: `paper.mjs run --ledger <runs.jsonl> --input <spec> --input <data> --output <svg>
// -- node figure.mjs draw <spec> --out <svg>`. The spec format is in references/artifacts.md (Figure Spec).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { drawFigure, TYPES } from "./lib/figure.mjs";

const USAGE = [
  "Usage: figure.mjs draw <spec.json> --out <figure.svg> [--json]",
  "",
  `Types: ${TYPES.join(", ")}. The spec names its data file (JSON rows, JSONL or CSV); values typed into the spec are refused.`,
].join("\n");

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string" }, json: { type: "boolean", default: false }, help: { type: "boolean" } },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (parsed.values.help) {
  console.log(USAGE);
  process.exit(0);
}
const [command, specPath] = parsed.positionals;
if (command !== "draw" || !specPath || !parsed.values.out) fail(USAGE);

let spec;
try {
  spec = JSON.parse(readFileSync(specPath, "utf8"));
} catch (error) {
  fail(`cannot read the spec ${specPath}: ${error.message}`);
}
let result;
try {
  result = drawFigure(spec, specPath);
} catch (error) {
  console.error(`${specPath}: ${error.message}`);
  process.exit(1);
}
mkdirSync(dirname(parsed.values.out), { recursive: true });
writeFileSync(parsed.values.out, result.svg);
if (parsed.values.json) console.log(JSON.stringify({ spec: specPath, out: parsed.values.out, series: result.series }));
else
  console.log(
    `${parsed.values.out}: ${spec.type}, ${result.series.map((each) => `${each.label} (${each.points} points)`).join(", ")}`,
  );
