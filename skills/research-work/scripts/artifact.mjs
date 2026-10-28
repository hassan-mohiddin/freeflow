#!/usr/bin/env node
// Create and check Research Work's artifacts. The formats are defined in references/artifacts.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import {
  KINDS_OF_ARTIFACT,
  judgeCitations,
  judgeCounts,
  kindOf,
  ledgerRows,
  newRequests,
  parseMarkdown,
  parseTable,
  planHypotheses,
  planVariants,
  searchCounts,
  skeleton,
  validate,
} from "./lib/formats.mjs";
import { figureReceipts } from "./lib/paper.mjs";
import { demotedHypotheses, lockState } from "./lib/study.mjs";

const USAGE = [
  "Usage: artifact.mjs init <kind> <path> --title <title> --owner <owner> [--rigor check|study|publication]",
  "       artifact.mjs init project <folder> --title <title> --owner <owner> [--rigor check|study|publication]",
  "       artifact.mjs validate <path> [--sources <source ledger>] [--plan <study plan>] [--search <search ledger>] [--json]",
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
      plan: { type: "string" },
      search: { type: "string" },
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

if (command === "init" && rest[0] === "project") {
  // The default layout of a research project: the brief and ledgers, the study, the register, the paper and its
  // reviews. Paths in the artifacts are relative, so another layout works too.
  const [, folder] = rest;
  if (!folder) fail(USAGE);
  if (!values.title || !values.owner) fail("init needs --title and --owner");
  if (existsSync(folder) && readdirSync(folder).length > 0) fail(`${folder} is not empty; init never overwrites`);
  const files = {
    "brief.md": skeleton("research-brief", { title: values.title, owner: values.owner, rigor: values.rigor }),
    "sources/sources.md": skeleton("source-ledger", { title: values.title, owner: values.owner }),
    "sources/searches.jsonl": "",
    "claims.md": skeleton("claims-register", { title: values.title, owner: values.owner }),
    "paper/outline.md": skeleton("paper-outline", { title: values.title, owner: values.owner })
      .replace("<path to the claims register the paper draws on>", "../claims.md")
      .replace("<the run ledger holding the figures' receipts, or none>", "runs.jsonl"),
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), text);
  }
  for (const empty of ["study/results", "paper/figures", "paper/build", "reviews"])
    mkdirSync(join(folder, empty), { recursive: true });
  console.log(`Created project: ${folder}`);
  for (const line of [
    "  brief.md                the research brief",
    "  sources/                sources.md (source ledger), searches.jsonl (search ledger), saved copies",
    "  study/                  plan.md (artifact.mjs init study-plan), runs.jsonl, deviations.jsonl, results/",
    "  claims.md               the claims register",
    "  paper/                  outline.md, paper.md, figures/ (specs and SVGs), refs.bib, build/, runs.jsonl, rebuttal.md",
    "  reviews/                review briefs and reports",
  ])
    console.log(line);
} else if (command === "init") {
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
  if (values.plan && kind !== "claims-register") fail("--plan applies only to a claims register");
  if (values.search && kind !== "claims-register") fail("--search applies only to a claims register");
  if (values.sources && !["claims-register", "evidence-table", "recheck"].includes(kind))
    fail("--sources applies only to a claims register, an evidence table or a recheck table");
  const options = {};
  if (values.sources) options.ledger = ledgerRows(read(values.sources));
  if (values.plan) {
    read(values.plan);
    const state = lockState(values.plan);
    options.plan = {
      hypotheses: planHypotheses(read(values.plan)),
      locked: state.locked,
      reason: state.reason,
      demoted: demotedHypotheses(state.lock),
      // Every variant the plan has ever listed, from each lock entry, so an amendment cannot drop one unreported.
      variants: [
        ...new Set([
          ...planVariants(read(values.plan)),
          ...(state.lock?.entries ?? []).flatMap((entry) => entry.variants ?? []),
        ]),
      ],
    };
  }
  if (values.search)
    options.searches = new Set(
      read(values.search)
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((record) => record?.kind === "query")
        .map((record) => record.id),
    );
  const rows = kind === "claims-register" ? (parseTable(parseMarkdown(text).lines)?.rows ?? []) : [];
  const cited = [...new Set(rows.flatMap((row) => judgeCitations(row.cells.Source ?? "")))];
  if (cited.length > 0) {
    options.judges = new Map(
      cited.map((citation) => {
        const file = resolve(dirname(path), citation);
        return [citation, existsSync(file) ? judgeCounts(readFileSync(file, "utf8")) : undefined];
      }),
    );
  }
  if (kind === "paper-outline") {
    // An outline's claim IDs are checked against the register its header names, and its figures' data on disk.
    const register = parseMarkdown(text).header.Register;
    const registerPath = register ? resolve(dirname(path), register) : null;
    if (registerPath && existsSync(registerPath))
      options.register = new Set(
        (parseTable(parseMarkdown(readFileSync(registerPath, "utf8")).lines)?.rows ?? []).map((row) => row.cells.ID),
      );
    else if (registerPath) options.registerMissing = true;
    options.dataExists = (file) => existsSync(resolve(dirname(path), file));
    Object.assign(options, figureReceipts(path, parseMarkdown(text).header.Runs));
  }
  const confirmatory = rows.some((row) => row.cells.Kind === "confirmatory");
  const result = validate(kind, text, options);
  if (values.json) console.log(JSON.stringify({ path, ...result }, null, 2));
  else {
    console.log(`${path}: ${kind}, ${result.valid ? "valid" : `${result.problems.length} problem(s)`}`);
    for (const problem of result.problems) console.log(`  problem: ${problem}`);
    if (kind === "claims-register" && !values.sources)
      console.log("  not checked: levels against the source ledger (pass --sources)");
    if (kind === "claims-register" && confirmatory && !values.plan)
      console.log("  not checked: confirmatory claims against a locked study plan (pass --plan)");
    if (
      kind === "paper-outline" &&
      /^not yet stated\.?$/.test((parseMarkdown(text).sections.get("Proposition") ?? []).join(" ").trim())
    )
      console.log(
        "  note: the proposition is not yet stated; a draft that still does not state one does not pass review",
      );
    if (kind === "evidence-table" && !values.sources)
      console.log("  not checked: levels against the source ledger (pass --sources)");
    if (kind === "rebuttal") {
      const added = newRequests(text);
      if (added.length > 0) console.log(`  new requests in a later round: ${added.join(", ")}`);
    }
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
