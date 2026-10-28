#!/usr/bin/env node
// One gate per rigor: run every offline check a research folder's rigor requires on the files present, and print one
// summary of what passed, what failed, what could not run and why, and what is left before the report or paper goes
// out. Each check is the script that owns it, run as a child process, so no rule has a second copy here. Nothing it
// runs goes online or calls a model.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { ledgerRows, parseMarkdown, parseTable } from "./lib/formats.mjs";
import { LAYOUT, isSkeleton } from "./lib/project.mjs";
import { resultCitations } from "./lib/report.mjs";
import { claimsWithEvidence } from "./lib/support.mjs";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const RIGORS = ["check", "study", "publication"];
const FILES = Object.keys(LAYOUT);

const USAGE = [
  "Usage: research.mjs gate <folder> [--rigor check|study|publication] [--repo <name>=<clone>]... [--copy S<n>=<file>]...",
  "                         [--reads <reads.jsonl>] [--limit <section>=<words>]... [--allow <word>]...",
  "                         [--max-pages <n>] [--max-words <n>] [--require <heading>]... [--unsupported-ok C<n>,...]",
  "                         [--<file> <path>]... [--json]",
  "",
  "The folder is read as artifact.mjs init project lays it out; --<file> names one elsewhere:",
  ...FILES.map((file) => `  --${file.padEnd(9)} ${LAYOUT[file]}`),
  "A path given with --<file> is relative to the current folder. The rigor comes from the brief's header;",
  "--rigor is used only when there is no brief, and one that differs from the brief's fails the gate.",
  "",
  "Every rigor checks the brief, the source ledger and each report or paper present: cite-check, trace (with",
  "--results when there is a study plan, and --results --cited-only when a register row's Source names a result file),",
  "and for a paper its outline and draft-check. study and publication need the",
  "claims register; publication also needs every source opened or run, the citation support verdicts",
  "(support-check, on packets that still match the report and paper, with a packet for every claim either cites with",
  "a code citation or quote, except those --unsupported-ok marks out by the author's choice), and a paper's PDF",
  "(check-pdf, against the venue's --max-pages, --max-words or --require). A study plan, when present, is validated",
  "and checked with study.mjs check, and the register is validated against it; a register with a confirmatory claim",
  "and no plan fails. A review's evidence table is validated with --sources. A file that is present is always",
  "checked, and its failure fails the gate (a PDF below publication is shown and holds nothing); a claims register,",
  "outline, evidence table or recheck table still as init wrote it counts as absent.",
  "A passed check's notes are printed beneath it. --repo, --copy and --reads go to cite-check and support; --copy,",
  "--limit and --allow to draft-check; --max-pages, --max-words and --require to check-pdf. A source's saved copy",
  "in the sources folder, named for its ID (S3.txt) or its pin without the scheme (2306.05685v4.txt), is found",
  "without --copy; a --copy given wins.",
  "",
  "Exit code 0 when every required check passed, 1 when one failed or could not run, 2 on a usage error.",
].join("\n");

function fail(message) {
  console.error(message);
  process.exit(2);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      rigor: { type: "string" },
      repo: { type: "string", multiple: true, default: [] },
      copy: { type: "string", multiple: true, default: [] },
      reads: { type: "string" },
      limit: { type: "string", multiple: true, default: [] },
      allow: { type: "string", multiple: true, default: [] },
      "max-pages": { type: "string" },
      "max-words": { type: "string" },
      require: { type: "string", multiple: true, default: [] },
      "unsupported-ok": { type: "string" },
      ...Object.fromEntries(FILES.map((file) => [file, { type: "string" }])),
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
const [command, folder] = positionals;
if (command !== "gate" || !folder || positionals.length !== 2) fail(USAGE);
if (!existsSync(folder)) fail(`no such folder: ${folder}`);
if (values.rigor !== undefined && !RIGORS.includes(values.rigor)) fail(`--rigor must be one of: ${RIGORS.join(", ")}`);
// Claims the author keeps out of the support check: listed in what is left, never counted as checked.
const markedOut = (values["unsupported-ok"] ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
if (markedOut.some((id) => !/^C\d+$/.test(id))) fail("--unsupported-ok takes claim IDs: C<n>,...");

// Every path as the commands are shown and run: relative to the current folder when inside it, so a command can be
// copied and rerun.
const shown = (path) => {
  const near = relative(process.cwd(), path);
  return near.startsWith("..") ? path : near || ".";
};
const paths = Object.fromEntries(
  FILES.map((file) => [file, shown(values[file] ? resolve(values[file]) : resolve(folder, LAYOUT[file]))]),
);
const text = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};
const has = (file) => existsSync(paths[file]);
// A claims register or outline unchanged since init counts as not started; a search ledger with no lines as empty.
const used = {
  claims: has("claims") && !isSkeleton("claims-register", text(paths.claims)),
  outline: has("outline") && !isSkeleton("paper-outline", text(paths.outline)),
  searches: has("searches") && (text(paths.searches) ?? "").trim() !== "",
  // A review's recheck table caps the claims resting on a mismatched source; unchanged since init, it holds no rows.
  recheck: has("recheck") && !isSkeleton("recheck", text(paths.recheck)),
  // A review's evidence table, as init wrote it, holds no rows yet.
  evidence: has("evidence") && !isSkeleton("evidence-table", text(paths.evidence)),
};
for (const file of ["brief", "sources", "plan", "report", "paper", "pdf", "packets", "verdicts"])
  used[file] = has(file);

// The rigor: the brief's, then --rigor, then the skill's default.
const briefRigor = used.brief ? parseMarkdown(text(paths.brief)).header.Rigor : undefined;
const rigor = RIGORS.includes(briefRigor) ? briefRigor : (values.rigor ?? "study");
const rigorFrom = RIGORS.includes(briefRigor)
  ? paths.brief
  : values.rigor
    ? "--rigor"
    : "the default; no rigor in a brief";
const atLeast = (level) => RIGORS.indexOf(rigor) >= RIGORS.indexOf(level);

const repeat = (flag, list) => list.flatMap((value) => [flag, value]);

// A source's saved copy, found in the sources folder by the source's ID (S3.txt) or its pin with any scheme dropped
// (arXiv:2306.05685v4 as 2306.05685v4.txt, a DOI's / as _), so quotes are checked without a --copy for each; the
// ID's name wins over the pin's, and a --copy given wins over both.
const COPY_TYPES = /\.(txt|md|html?)$/i;
function savedCopies() {
  const found = new Map();
  const walk = (dir, depth) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && depth < 3) walk(path, depth + 1);
      else if (entry.isFile() && COPY_TYPES.test(entry.name) && !found.has(entry.name.replace(COPY_TYPES, "")))
        found.set(entry.name.replace(COPY_TYPES, ""), path);
    }
  };
  walk(dirname(paths.sources), 0);
  const given = new Set(values.copy.map((entry) => entry.split("=")[0]));
  const copies = [];
  for (const [id, row] of used.sources ? ledgerRows(text(paths.sources)) : []) {
    if (given.has(id)) continue;
    const pin = (row.Pin ?? "")
      .split(/\s/)[0]
      .replace(/^[a-z]+:(?!\/\/)/i, "")
      .replaceAll("/", "_");
    const path = found.get(id) ?? (pin ? found.get(pin) : undefined);
    if (path) copies.push(`${id}=${shown(path)}`);
  }
  return copies;
}
const foundCopies = savedCopies();
const allCopies = [...values.copy, ...foundCopies];
const sourceOptions = [...repeat("--repo", values.repo), ...repeat("--copy", allCopies)];

const checks = [];

/** A command as it can be copied and run again from the current folder. */
const commandLine = (script, args) =>
  ["node", shown(join(SCRIPTS, script)), ...args]
    .map((arg) => (/[\s"'$]/.test(arg) ? JSON.stringify(arg) : arg))
    .join(" ");

// A passed check's lines that say what it did not check, or warn: shown beneath it, since passing does not cover them.
const NOTE = /^note:|not checked|no citations found|not anchored|no validity check/i;

/** Run one owning script; its exit code decides: 0 passed, 1 failed, anything else could not run. */
function run(script, args, { notChecked, nothingChecked } = {}) {
  const child = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  // stderr is kept whenever the check did not pass: a reason written there is the reason it failed.
  const output = `${child.stdout ?? ""}${child.status === 0 ? "" : (child.stderr ?? "")}`
    .split("\n")
    .filter((line) => line.trim() !== "");
  const command = commandLine(script, args);
  if (child.status === 0 && nothingChecked) {
    // A check that found nothing to check has not run.
    const reason = nothingChecked(output);
    if (reason) return { status: "not run", reason, command, output };
  }
  if (child.status === 0 && notChecked) {
    // A check that exits 0 with items it could not check has not passed.
    const count = notChecked(output);
    if (count > 0) return { status: "failed", reason: `${count} not checked`, command, output };
  }
  if (child.status === 0) {
    const notes = output
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => NOTE.test(line));
    return { status: "passed", reason: output[0] ?? "passed", command, output, notes };
  }
  if (child.status === 1) return { status: "failed", reason: output[0] ?? "failed", command, output };
  return { status: "not run", reason: `could not run: ${output[0] ?? `exit ${child.status}`}`, command, output };
}

/** Record a check: its label, whether the rigor or a present file requires it, and how it came out. */
function add(id, label, required, outcome) {
  checks.push({ id, label, required, ...outcome });
}

const notRun = (reason, todo) => ({ status: "not run", reason, todo });

// The brief and the source ledger: every rigor.
add(
  "brief",
  "research brief",
  true,
  used.brief
    ? run("artifact.mjs", ["validate", paths.brief])
    : notRun(`no ${paths.brief}`, "create the brief with artifact.mjs init research-brief and agree it with the user"),
);
if (values.rigor && RIGORS.includes(briefRigor) && values.rigor !== briefRigor)
  add("rigor", "rigor", true, {
    status: "failed",
    reason: `the brief says ${briefRigor}, --rigor says ${values.rigor}`,
    todo: "the rigor is the user's choice in the brief: change it there with the user, or drop --rigor",
  });
add(
  "sources",
  "source ledger",
  true,
  used.sources ? run("artifact.mjs", ["validate", paths.sources]) : notRun(`no ${paths.sources}`),
);
if (atLeast("publication") && used.sources) {
  // Publication rigor: every source opened or run, so none rests on an abstract, a summary or memory.
  const weak = [...ledgerRows(text(paths.sources))].filter(([, row]) =>
    ["abstract", "summary-only", "memory"].includes(row.Checked),
  );
  add(
    "opened",
    "every source opened or run",
    true,
    weak.length === 0
      ? { status: "passed", reason: "no source checked only from an abstract, a summary or memory" }
      : {
          status: "failed",
          reason: `${weak.length} source(s) not opened: ${weak.map(([id, row]) => `${id} (${row.Checked})`).join(", ")}`,
          todo: "open or run each one and update its Checked, or drop it and the claims resting on it",
        },
  );
}

if (used.searches) add("searches", "search ledger", true, run("artifact.mjs", ["validate", paths.searches]));
// A review's evidence table: its rows, and with the source ledger, its sources and levels.
if (used.evidence)
  add(
    "evidence",
    "evidence table",
    true,
    run("artifact.mjs", ["validate", paths.evidence, ...(used.sources ? ["--sources", paths.sources] : [])]),
  );

// A study: its plan, and its lock, receipts and deviations.
if (used.plan) {
  add("plan", "study plan", true, run("artifact.mjs", ["validate", paths.plan]));
  add("study", "study records", true, run("study.mjs", ["check", paths.plan]));
}

// A confirmatory claim is a study's: with no plan, the study is missing the plan that holds its decision rule.
const registerRows = used.claims ? (parseTable(parseMarkdown(text(paths.claims)).lines)?.rows ?? []) : [];
if (used.claims && !used.plan) {
  const confirmatory = registerRows.filter((row) => row.cells.Kind === "confirmatory").map((row) => row.cells.ID);
  if (confirmatory.length > 0)
    add("plan", "study plan", true, {
      status: "failed",
      reason: `no ${paths.plan}, but the register holds confirmatory claim(s) ${confirmatory.join(", ")}`,
      todo: `a confirmatory claim needs the study's locked plan: write and lock ${paths.plan} (artifact.mjs init study-plan, then study.mjs lock with the user's yes), or, when no locked study tested ${confirmatory.join(", ")}, register them as exploratory`,
    });
}

// The claims register: study and publication; at check rigor when one is used.
const registerArgs = [
  "validate",
  paths.claims,
  "--sources",
  paths.sources,
  ...(used.plan ? ["--plan", paths.plan] : []),
  ...(used.searches ? ["--search", paths.searches] : []),
  ...(used.recheck ? ["--recheck", paths.recheck] : []),
];
if (used.claims && used.sources) add("register", "claims register", true, run("artifact.mjs", registerArgs));
else if (used.claims) add("register", "claims register", true, notRun(`needs the source ledger, ${paths.sources}`));
else
  add(
    "register",
    "claims register",
    atLeast("study"),
    notRun(
      `${has("claims") ? `${paths.claims} is still the skeleton init wrote` : `no ${paths.claims}`}${atLeast("study") ? "" : " (optional at check rigor)"}`,
      atLeast("study") ? "register every claim the report makes before the prose states it" : undefined,
    ),
  );

// A register row whose Source names a result file (not a code citation S3:path) has its numbers traced to it, plan
// or not: a review's pooled number is computed into synthesis/, with no study plan.
const citesResults = registerRows.some(
  (row) => resultCitations(row.cells.Source ?? "").filter((file) => !/^S\d+:/.test(file.path)).length > 0,
);

// Each product present: its citations, its numbers and claim IDs, and for a paper its outline and draft checks.
const products = [
  ["report", "report"],
  ["paper", "paper"],
].filter(([file]) => used[file]);
if (products.length === 0)
  add(
    "product",
    "report or paper",
    true,
    notRun(`no ${paths.report} or ${paths.paper}`, "write the report, or the paper, where the gate can read it"),
  );
const citeNotChecked = (output) => Number(/(\d+) not checked/.exec(output[0] ?? "")?.[1] ?? 0);
// cite-check reads code citations and quotes. A report that has none has nothing checked; a paper may cite only
// with [@S<n>], which draft-check checks against the ledger.
const citeNothing = (file) => (output) =>
  output.some((line) => /no citations found/.test(line)) && !(file === "paper" && /\[@S\d+/.test(text(paths.paper)))
    ? "no citations found: nothing was checked"
    : null;
for (const [file, name] of products) {
  const cited = used.sources
    ? run(
        "sources.mjs",
        [
          "cite-check",
          paths[file],
          "--ledger",
          paths.sources,
          ...sourceOptions,
          ...(values.reads ? ["--reads", values.reads] : []),
        ],
        { notChecked: citeNotChecked, nothingChecked: citeNothing(file) },
      )
    : notRun(`needs the source ledger, ${paths.sources}`);
  if (cited.status === "not run" && cited.command)
    cited.todo = `cite the sources each claim rests on in ${paths[file]}: one that cites none has nothing checked`;
  add(`${file}-cite`, `${name}: citations`, true, cited);
  add(
    `${file}-trace`,
    `${name}: numbers and claim IDs`,
    used.claims || atLeast("study"),
    used.claims
      ? run("claims.mjs", [
          "trace",
          paths[file],
          "--register",
          paths.claims,
          ...(used.plan ? ["--results"] : citesResults ? ["--results", "--cited-only"] : []),
          ...(used.searches ? ["--search", paths.searches] : []),
        ])
      : notRun(
          atLeast("study")
            ? `needs the claims register, ${paths.claims}`
            : `no claims register to trace against (optional at check rigor)`,
        ),
  );
}
if (used.outline || used.paper)
  add(
    "outline",
    "paper outline",
    true,
    used.outline
      ? run("artifact.mjs", ["validate", paths.outline])
      : notRun(
          has("outline") ? `${paths.outline} is still the skeleton init wrote` : `no ${paths.outline}`,
          "fill the outline (artifact.mjs init paper-outline makes one) and agree it before the draft",
        ),
  );
if (used.paper)
  add(
    "draft",
    "paper: draft checks",
    true,
    run("claims.mjs", [
      "draft-check",
      paths.paper,
      ...(used.outline ? ["--outline", paths.outline] : []),
      ...(used.sources ? ["--ledger", paths.sources] : []),
      ...repeat("--copy", allCopies),
      ...repeat("--limit", values.limit),
      ...repeat("--allow", values.allow),
    ]),
  );

// Citation support: required at publication, checked below it when answers exist. The packets come from the report
// and the paper, whichever are present; they must still be what those and their sources give now, and at publication
// every claim either cites with a code citation or quote needs a packet, unless the author marks it out.
const targets = products.map(([file]) => file);
const target = targets.length > 0 ? targets.join(" and ") : null;
const supportRequired = atLeast("publication") && target !== null;
if (target && (supportRequired || used.verdicts)) {
  const build = (out, only) => [
    "support",
    ...targets.map((file) => paths[file]),
    "--register",
    paths.claims,
    "--ledger",
    paths.sources,
    "--out",
    out,
    ...(only ? ["--only", only] : []),
    ...sourceOptions,
  ];
  const buildCommand = commandLine("claims.mjs", build(paths.packets));
  // The claims the report and paper cite with a code citation or quote, which the support check must cover.
  const wanted =
    used.claims && supportRequired
      ? claimsWithEvidence(targets.map((file) => text(paths[file])).join("\n\n"), registerRows).filter(
          (id) => !markedOut.includes(id),
        )
      : [];
  if (!used.claims || !used.sources)
    add("support", "citation support", true, notRun("needs the claims register and the source ledger"));
  else if (!used.packets)
    add(
      "support",
      "citation support",
      true,
      notRun(
        `no packets at ${paths.packets}`,
        `build them with ${buildCommand}${wanted.length > 0 ? ` (it cites ${wanted.join(", ")} with a code citation or quote; each needs a packet, or --unsupported-ok to mark it out)` : ""}, give them to a separate reader, and save its answers to ${paths.verdicts}`,
      ),
    );
  else {
    const packets = text(paths.packets);
    const claims = [
      ...new Set(
        packets
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => {
            try {
              return JSON.parse(line).claim;
            } catch {
              return null;
            }
          })
          .filter(Boolean),
      ),
    ];
    const scratch = mkdtempSync(join(tmpdir(), "research-gate-"));
    const fresh = join(scratch, "packets.jsonl");
    if (claims.length > 0)
      spawnSync(process.execPath, [join(SCRIPTS, "claims.mjs"), ...build(fresh, claims.join(","))], {
        encoding: "utf8",
      });
    const now = text(fresh);
    rmSync(scratch, { recursive: true, force: true });
    if (claims.length === 0)
      add("support", "citation support", true, {
        status: "failed",
        reason: `${paths.packets} holds no packets`,
        todo: `give each key claim a code citation or quote beside it, and build the packets with ${buildCommand}`,
      });
    else if (now !== packets)
      add("support", "citation support", true, {
        status: "failed",
        reason: `${paths.packets} is not what the ${target}, the register and the sources give now`,
        todo: `build the packets again with ${buildCommand} --only ${claims.join(",")} (with the --repo and --copy they were built with) and have them answered again`,
      });
    else if (!used.verdicts)
      add(
        "support",
        "citation support",
        true,
        notRun(
          `no answers at ${paths.verdicts}`,
          `give ${paths.packets} to a separate reader and save its answers there`,
        ),
      );
    else
      add(
        "support",
        "citation support",
        true,
        run("claims.mjs", ["support-check", paths.verdicts, "--packets", paths.packets]),
      );
    if (supportRequired && claims.length > 0) {
      // Which claims to check is the author's choice, so a cited claim left out is named, never passed over.
      const uncovered = wanted.filter((id) => !claims.includes(id));
      add(
        "coverage",
        "citation support: every cited claim",
        true,
        uncovered.length === 0
          ? {
              status: "passed",
              reason: `every claim cited with a code citation or quote has a packet${markedOut.length > 0 ? `, except ${markedOut.join(", ")}, marked out by --unsupported-ok` : ""}`,
            }
          : {
              status: "failed",
              reason: `${uncovered.length} claim(s) cited with a code citation or quote have no packet: ${uncovered.join(", ")}`,
              todo: `add them with ${buildCommand} --only ${[...claims, ...uncovered].join(",")} and have the new packets answered, or keep them out of the support check by your choice with --unsupported-ok ${uncovered.join(",")}`,
            },
      );
    }
  }
}

// The built PDF: required for a paper at publication rigor, checked whenever one is present, and below publication
// shown without holding the gate. At publication it is checked against the venue: with no limit or required section
// given, it is not; given only some, it is checked against those (a page limit leaves the words unasked).
const venueGiven = Boolean(values["max-pages"] || values["max-words"] || values.require.length > 0);
const venueTodo =
  "check it against the venue: run the gate again with the venue's page and word limits and its required sections (--max-pages <n>, --max-words <n>, --require <section> for each; the venue's current call and template give them)";
if (used.pdf || (used.paper && atLeast("publication"))) {
  const runs = join(dirname(paths.paper), "runs.jsonl");
  const pdf = used.pdf
    ? run("paper.mjs", [
        "check-pdf",
        paths.pdf,
        ...(values["max-pages"] ? ["--max-pages", values["max-pages"]] : []),
        ...(values["max-words"] ? ["--max-words", values["max-words"]] : []),
        ...(used.paper && values.require.length > 0
          ? ["--source", paths.paper, ...repeat("--require", values.require)]
          : []),
      ])
    : notRun(
        `no ${paths.pdf}`,
        `build it with ${commandLine("paper.mjs", ["build", paths.paper, "--to", "pdf", "--out", paths.pdf, "--ledger", shown(resolve(runs)), "--venue"])}, then run the gate again${atLeast("publication") && !venueGiven ? " with the venue's --max-pages, --max-words and --require <section>" : ""}`,
      );
  if (used.pdf && atLeast("publication") && !venueGiven)
    Object.assign(pdf, {
      status: "failed",
      reason: `not checked against the venue: no --max-pages, --max-words or --require given (${pdf.reason})`,
      todo: venueTodo,
    });
  add("pdf", "paper: PDF", atLeast("publication"), pdf);
}

// What is left: each required check that did not pass, then the steps no script can take.
const blocking = checks.filter((check) => check.required && check.status !== "passed");
const todo = blocking.map(
  (check) =>
    `${check.label}: ${check.todo ?? (check.status === "failed" ? `fix what it reports and rerun ${check.command}` : check.reason)}`,
);
if (atLeast("publication") && used.sources) {
  const unlooked = [...ledgerRows(text(paths.sources))]
    .filter(([, row]) => row.Lookup !== "verified")
    .map(([id]) => id);
  if (unlooked.length > 0)
    todo.push(
      `lookups: ${unlooked.join(", ")} not verified; ask the user once whether to look every reference up (sources.mjs lookup goes online, so the gate never runs it)`,
    );
}
if (markedOut.length > 0 && target)
  todo.push(`citation support: ${markedOut.join(", ")} not support-checked by the author's choice (--unsupported-ok)`);
if (!checks.some((check) => check.id === "support" && check.status === "passed") && target)
  todo.push("read again the lines each key claim rests on: passing checks do not show a range supports its claim");
if (atLeast("publication") && target)
  todo.push("review once through Review Work's artifact review, giving the reviewer this output with the artifacts");

const ready = blocking.length === 0;
if (values.json)
  console.log(
    JSON.stringify(
      {
        folder,
        rigor,
        rigor_from: rigorFrom,
        ready,
        copies: foundCopies,
        checks: checks.map(({ id, label, required, status, reason, command, output, notes }) => ({
          id,
          label,
          required,
          status,
          reason,
          notes: notes ?? [],
          command: command ?? null,
          output: output ?? [],
        })),
        todo,
      },
      null,
      2,
    ),
  );
else {
  console.log(`${folder}: ${rigor} rigor (from ${rigorFrom})`);
  if (foundCopies.length) console.log(`  saved copies found in the sources folder: ${foundCopies.join(", ")}`);
  for (const check of checks) {
    const mark = check.status === "not run" && check.required ? "not run (required)" : check.status;
    console.log(`  ${mark.padEnd(18)} ${check.label}: ${check.reason}`);
    if (check.status === "passed") for (const note of check.notes ?? []) console.log(`      ${note}`);
    else {
      if (check.command) console.log(`      ran: ${check.command}`);
      const rest = (check.output ?? []).slice(1);
      for (const line of rest.slice(0, 30)) console.log(`      ${line.trim()}`);
      if (rest.length > 30) console.log(`      ... ${rest.length - 30} more line(s); rerun the command to see them`);
    }
  }
  console.log(
    ready
      ? `Ready to go out: every required check passed.`
      : `Not ready: ${blocking.filter((check) => check.status === "failed").length} required check(s) failed, ${blocking.filter((check) => check.status === "not run").length} could not run. Fix each, or list it in the report with what it could not check.`,
  );
  if (todo.length > 0) {
    console.log("Left to do:");
    for (const item of todo) console.log(`  - ${item}`);
  }
}
process.exit(ready ? 0 : 1);
