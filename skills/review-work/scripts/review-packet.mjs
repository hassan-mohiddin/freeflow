#!/usr/bin/env node
// Prefills a work reviewer's pointer brief (references/work.md, "The Brief") from the repository and the task folder,
// then runs check-brief.mjs on it, so the brief points at the requirements, the right diff and the prior report
// without being assembled by hand. It also reports the review gate's triggers the diff shows and the review-round
// budget. Lines it cannot fill (the Boundary, unless given) stay empty, so check-brief refuses the brief until the
// initiator fills them.
// Usage: review-packet.mjs --review <1|2|3> --base <ref> [--head <ref>] [--task <task folder>] [--out <brief.md>]
//                          [--boundary <text>] [--agreement <path>]... [--evidence <path>]... [--may-run <text>]
//                          [--root <repository>] [--json]
// With --task, the brief is written to <task>/scratch/reviews/R<n>-brief.md, the report path is R<n>-report.md beside
// it, the agreement defaults to the task's record.md, and Review 2 or 3 takes its diff from the previous brief's
// reviewed state and points to R<n-1>-report.md. Docs come from Write Docs' docs-check.mjs --covering on the changed
// files. Exit code: check-brief's (0 passes, 1 has problems); 2 on a usage or Git error.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const USAGE =
  "Usage: review-packet.mjs --review <1|2|3> --base <ref> [--head <ref>] [--task <task folder>] [--out <brief.md>] [--boundary <text>] [--agreement <path>]... [--evidence <path>]... [--may-run <text>] [--root <repository>] [--json]";
const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_BRIEF = join(HERE, "check-brief.mjs");
const DOCS_CHECK = resolve(HERE, "../../write-docs/scripts/docs-check.mjs");
const SKILL = resolve(HERE, "../SKILL.md");

function fail(message) {
  console.error(message);
  process.exit(2);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      review: { type: "string" },
      base: { type: "string" },
      head: { type: "string", default: "HEAD" },
      task: { type: "string" },
      out: { type: "string" },
      boundary: { type: "string" },
      agreement: { type: "string", multiple: true, default: [] },
      evidence: { type: "string", multiple: true, default: [] },
      "may-run": { type: "string" },
      root: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const round = Number(values.review);
if (![1, 2, 3].includes(round) || !values.base) fail(USAGE);
if (!values.task && !values.out) fail(`give --task or --out for where the brief goes\n${USAGE}`);

const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
let root;
try {
  root = resolve(git(resolve(values.root ?? "."), ["rev-parse", "--show-toplevel"]).trim());
} catch {
  fail("not inside a Git repository");
}
const commitOf = (ref) => {
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
  } catch {
    return null;
  }
};
const head = commitOf(values.head);
if (!head) fail(`no such commit: ${values.head}`);
if (!commitOf(values.base)) fail(`no such commit: ${values.base}`);

// Paths in the brief: relative to the repository when inside it, absolute otherwise. A path from Git or docs-check is
// relative to the repository, so it is resolved against root before it reaches show.
const show = (path) => {
  const relativePath = relative(root, resolve(path));
  return relativePath.startsWith("..") ? resolve(path) : relativePath;
};
const tick = (paths) => paths.map((path) => `\`${show(path)}\``).join(", ");

const task = values.task ? resolve(values.task) : null;
const reviews = task ? join(task, "scratch", "reviews") : dirname(resolve(values.out));
const briefPath = values.out ? resolve(values.out) : join(reviews, `R${round}-brief.md`);
const reportPath = join(task ? reviews : dirname(briefPath), `R${round}-report.md`);
const notes = [];

// Review 2 or 3 reviews the range since the previous review's reviewed state.
let diffBase = values.base;
let previousReport = null;
if (round > 1) {
  const previousBrief = join(reviews, `R${round - 1}-brief.md`);
  const reviewed = existsSync(previousBrief)
    ? /^\s*(?:[-*]\s+)?(?:\*\*)?Reviewed state:(?:\*\*)?\s*`?([0-9a-fA-F]{7,40}|\S+?)`?(\s|$)/m.exec(
        readFileSync(previousBrief, "utf8"),
      )?.[1]
    : null;
  if (reviewed && commitOf(reviewed)) diffBase = reviewed;
  else notes.push(`no previous brief with a Reviewed state at ${show(previousBrief)}: the diff starts at --base`);
  const candidate = join(reviews, `R${round - 1}-report.md`);
  if (existsSync(candidate)) previousReport = candidate;
  else notes.push(`no previous report at ${show(candidate)}: add its path and adjudication to "Previous report"`);
}

const agreement = values.agreement.length
  ? values.agreement
  : task && existsSync(join(task, "record.md"))
    ? [join(task, "record.md")]
    : [];
if (!agreement.length) notes.push("no agreement found: pass --agreement (the record, or the accepted requirements)");

const changed = git(root, ["-c", "core.quotePath=false", "diff", "--name-only", diffBase, head])
  .split("\n")
  .filter(Boolean);

// Developer docs covering the changed files.
let docs = [];
if (changed.length && existsSync(DOCS_CHECK)) {
  const run = spawnSync(
    process.execPath,
    [DOCS_CHECK, ...changed.flatMap((path) => ["--covering", path]), "--root", root, "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status === 0)
    docs = [
      ...new Set(
        JSON.parse(run.stdout).paths.flatMap((entry) => entry.documents.map((doc) => resolve(root, doc.path))),
      ),
    ];
  else notes.push("docs-check could not run: fill Docs by hand");
}

// The project's Review Rules, when it keeps them in a file.
const rules = git(root, ["ls-files"])
  .split("\n")
  .filter((path) => /(^|\/)(REVIEW\.md|review-rules\.md|REVIEW_RULES\.md)$/i.test(path))
  .map((path) => resolve(root, path));

// The project's declared checks, for "May run".
let mayRun = values["may-run"] ?? "";
if (!mayRun && existsSync(join(root, "package.json"))) {
  try {
    const scripts = Object.keys(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {});
    const declared = ["test", "check", "lint", "typecheck"].filter((name) => scripts.includes(name));
    if (declared.length)
      mayRun = `the project's declared checks: ${declared.map((name) => `\`npm ${name === "test" ? "test" : `run ${name}`}\``).join(", ")}`;
  } catch {
    // An unreadable package.json leaves May run for the initiator.
  }
}
if (!mayRun) notes.push('fill "May run": the declared checks, or "nothing"');

// Review gate triggers the diff shows; the agreement's own review triggers and Review Rules paths need a reader.
const TRIGGERS = [
  [
    "security, authentication, authorization or secrets",
    /(^|[/_.-])(auth[nz]?|oauth|login|passwords?|secrets?|credentials?|tokens?|permissions?|crypto|sessions?)([/_.-]|$)|authenticat|authoriz|(^|\/)\.env/i,
  ],
  ["possible data loss or a migration of stored data", /(migrat|schema|\.sql$|database|(^|\/)db\/|storage|persist)/i],
  [
    "CI or release files",
    /(^\.github\/workflows\/|^\.gitlab-ci|^\.circleci\/|(^|\/)release|CHANGELOG|^scripts\/release)/i,
  ],
  [
    "a public interface",
    /(^package\.json$|(^|\/)bin\/|\.d\.ts$|(^|\/)SKILL\.md$|command-surface|(^|\/)index\.[cm]?[jt]s$|\.proto$|openapi|(^|\/)api\/)/i,
  ],
];
const triggers = TRIGGERS.flatMap(([trigger, pattern]) => {
  const paths = changed.filter((path) => pattern.test(path));
  return paths.length ? [{ trigger, paths: paths.slice(0, 10), more: Math.max(0, paths.length - 10) }] : [];
});
const budget =
  round === 1
    ? "Review 1 of at most 3: the first selected independent review, broad by default."
    : round === 2
      ? "Review 2 of at most 3: a focused follow-up on the range since Review 1; if it stays Blocking, adjudicate and diagnose before any Review 3."
      : "Review 3 of 3: exceptional, separately authorized and final; if it stays Blocking, rethink the approach rather than correct again.";

const lines = [
  `Review: ${round}`,
  `Boundary: ${values.boundary ?? ""}`,
  `Reviewed state: ${head.slice(0, 12)}`,
  `Method: ${tick([SKILL, join(dirname(SKILL), "references", "work.md")])}`,
  `Agreement: ${tick(agreement)}`,
  `Docs: ${docs.length ? tick(docs) : "none"}`,
  `Review rules: ${rules.length ? tick(rules) : "none"}`,
  `Diff: ${commitOf(diffBase).slice(0, 12)}..${head.slice(0, 12)}`,
  `Evidence: ${values.evidence.length ? tick(values.evidence) : "none"}`,
  `May run: ${mayRun}`,
  ...(round > 1 ? [`Previous report: ${previousReport ? tick([previousReport]) : ""}`] : []),
  `Report: ${tick([reportPath])}`,
];
mkdirSync(dirname(briefPath), { recursive: true });
writeFileSync(briefPath, `${lines.join("\n")}\n`);
mkdirSync(dirname(reportPath), { recursive: true });

const check = spawnSync(process.execPath, [CHECK_BRIEF, briefPath, "--root", root, "--json"], { encoding: "utf8" });
let checked;
try {
  checked = JSON.parse(check.stdout);
} catch {
  fail(`check-brief failed: ${(check.stderr || check.stdout).trim()}`);
}

const result = {
  command: "review-packet",
  root,
  brief: briefPath,
  review: round,
  diff: `${diffBase}..${values.head}`,
  changedFiles: changed.length,
  gateTriggers: triggers,
  gateNotDetected: ["anything the work agreement names for review", "paths the Review Rules mark sensitive"],
  budget,
  notes,
  checkBrief: { ok: checked.ok, problems: checked.problems },
};
if (values.json) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Brief: ${briefPath}`);
  console.log(lines.map((line) => `  ${line}`).join("\n"));
  console.log(`Changed files: ${changed.length}.`);
  console.log(
    triggers.length
      ? `Gate triggers in the diff:\n${triggers.map((each) => `- ${each.trigger}: ${each.paths.join(", ")}${each.more ? ` and ${each.more} more` : ""}`).join("\n")}`
      : "Gate triggers in the diff: none detected by path.",
  );
  console.log(`Not detected here: ${result.gateNotDetected.join("; ")}.`);
  console.log(`Round budget: ${budget}`);
  for (const note of notes) console.log(`Note: ${note}`);
  console.log(
    checked.ok
      ? "check-brief: passes. Dispatch this brief."
      : `check-brief: refused. Fill these, then rerun check-brief:\n${checked.problems.map((each) => `- ${each.line}: ${each.problem}`).join("\n")}`,
  );
}
process.exit(checked.ok ? 0 : 1);
