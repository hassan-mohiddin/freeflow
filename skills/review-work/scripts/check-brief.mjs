#!/usr/bin/env node
// Checks a work reviewer's pointer brief (references/work.md, "The Brief") before it is dispatched: every
// required labelled line is present, every backticked path it points to exists, and every commit it names resolves.
// It checks pointers only; whether they point to the right inputs is the initiator's judgment.
// Usage: check-brief.mjs <brief> [--root <repository>] [--json]
// Paths resolve against --root (default: the current directory); absolute paths are allowed, and a "#anchor" suffix is
// ignored. Exit code 0 when the brief passes, 1 when it has problems, 2 on a usage error.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parseArgs } from "node:util";

const USAGE = "Usage: check-brief.mjs <brief> [--root <repository>] [--json]";

// Lines every brief carries. "paths" lines must point to at least one existing file unless "none" is allowed and given.
const REQUIRED = [
  { label: "Review", kind: "number" },
  { label: "Boundary", kind: "text" },
  { label: "Reviewed state", kind: "commit" },
  { label: "Method", kind: "paths" },
  { label: "Agreement", kind: "paths" },
  { label: "Docs", kind: "paths", none: true },
  { label: "Review rules", kind: "paths", none: true },
  { label: "Diff", kind: "range" },
  { label: "Evidence", kind: "paths", none: true },
  { label: "May run", kind: "text" },
  { label: "Report", kind: "report" },
];
const OPTIONAL = [
  { label: "Previous report", kind: "paths" },
  { label: "Lenses", kind: "text" },
  { label: "Notes", kind: "text" },
];

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { root: { type: "string" }, json: { type: "boolean", default: false } },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values, positionals } = parsed;
if (positionals.length !== 1) fail(USAGE);
const briefPath = resolve(positionals[0]);
if (!existsSync(briefPath)) fail(`no such brief: ${positionals[0]}`);
const root = resolve(values.root ?? ".");

// A labelled line is "Label: value" at the start of a line, optionally as a list item or in bold ("**Label:**").
const known = [...REQUIRED, ...OPTIONAL];
const lines = new Map();
for (const raw of readFileSync(briefPath, "utf8").split("\n")) {
  const match = raw.match(/^\s*(?:[-*]\s+)?(?:\*\*)?([A-Za-z ]+?):(?:\*\*)?\s*(.*)$/);
  if (!match) continue;
  const spec = known.find((each) => each.label.toLowerCase() === match[1].trim().toLowerCase());
  if (spec && !lines.has(spec.label)) lines.set(spec.label, match[2].trim());
}

const problems = [];
const problem = (label, message) => problems.push({ line: label, problem: message });

const commitOf = (ref) => {
  try {
    return execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};
const unquote = (value) => value.replace(/^`|`$/g, "").trim();
const pathsIn = (value) => [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1].replace(/#.*$/, "").trim());
const at = (path) => (isAbsolute(path) ? path : resolve(root, path));

function check(spec, value) {
  if (!value) return problem(spec.label, "is empty");
  if (spec.none && /^none\.?$/i.test(value)) return;
  if (spec.kind === "number") {
    const round = Number(value.match(/\d+/)?.[0]);
    if (![1, 2, 3].includes(round)) problem(spec.label, `must be 1, 2 or 3, not "${value}"`);
  } else if (spec.kind === "commit") {
    const ref = unquote(value.split(/\s+/)[0]);
    if (!commitOf(ref)) problem(spec.label, `names no commit in ${root}: ${ref}`);
  } else if (spec.kind === "range") {
    const range = unquote(value.split(/\s+/)[0]);
    const ends = range.split(/\.{2,3}/);
    if (ends.length !== 2 || !ends[0] || !ends[1]) return problem(spec.label, `must be <base>..<head>, not "${value}"`);
    for (const end of ends) if (!commitOf(end)) problem(spec.label, `names no commit in ${root}: ${end}`);
  } else if (spec.kind === "paths") {
    const paths = pathsIn(value);
    if (!paths.length)
      return problem(spec.label, `points to no path; write each path in backticks${spec.none ? ', or "none"' : ""}`);
    for (const path of paths)
      if (!existsSync(at(path))) problem(spec.label, `points to a path that does not exist: ${path}`);
  } else if (spec.kind === "report") {
    const [path] = pathsIn(value);
    if (!path) return problem(spec.label, "names no report path in backticks");
    if (!existsSync(dirname(at(path)))) problem(spec.label, `is in a folder that does not exist: ${dirname(path)}`);
  }
}

for (const spec of REQUIRED) {
  if (!lines.has(spec.label)) problem(spec.label, "is missing");
  else check(spec, lines.get(spec.label));
}
for (const spec of OPTIONAL) if (lines.has(spec.label)) check(spec, lines.get(spec.label));
const round = Number(lines.get("Review")?.match(/\d+/)?.[0]);
if ((round === 2 || round === 3) && !lines.has("Previous report"))
  problem("Previous report", `is missing; Review ${round} needs the previous report and its adjudication`);

const ok = problems.length === 0;
if (values.json) {
  console.log(JSON.stringify({ command: "check-brief", brief: briefPath, root, ok, problems }, null, 2));
} else if (ok) {
  console.log(`Brief passes: ${positionals[0]}`);
} else {
  console.log(`Brief refused: ${positionals[0]}`);
  for (const each of problems) console.log(`- ${each.line}: ${each.problem}`);
}
process.exit(ok ? 0 : 1);
