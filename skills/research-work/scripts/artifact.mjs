#!/usr/bin/env node
// Create and check Research Work's artifacts. The formats are defined in references/artifacts.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
  planLabelsByModel,
  planVariants,
  recheckFlags,
  screenerFiles,
  searchCounts,
  skeleton,
  validate,
} from "./lib/formats.mjs";
import { figureReceipts } from "./lib/paper.mjs";
import { demotedHypotheses, fileHash, lockState, readLedger } from "./lib/study.mjs";
import { projectFiles } from "./lib/project.mjs";
import { resultNumbers } from "./lib/report.mjs";

const USAGE = [
  "Usage: artifact.mjs init <kind> <path> --title <title> --owner <owner> [--rigor check|study|publication]",
  "       artifact.mjs init project <folder> --title <title> --owner <owner> [--rigor check|study|publication] [--kind review]",
  "       artifact.mjs validate <path> [--sources <source ledger>] [--plan <study plan>] [--search <search ledger>] [--recheck <recheck table>] [--json]",
  "       artifact.mjs counts <search ledger .jsonl> [--flow <flow.json>] [--json]",
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
      recheck: { type: "string" },
      kind: { type: "string" },
      flow: { type: "string" },
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
  // The default layout of a research project (lib/project.mjs): the brief and ledgers, the study, the register, the paper and its
  // reviews. Paths in the artifacts are relative, so another layout works too.
  const [, folder] = rest;
  if (!folder) fail(USAGE);
  if (!values.title || !values.owner) fail("init needs --title and --owner");
  if (values.kind !== undefined && values.kind !== "review")
    fail("--kind takes review (a literature or systematic review); leave it out for the default layout");
  if (existsSync(folder) && readdirSync(folder).length > 0) fail(`${folder} is not empty; init never overwrites`);
  const review = values.kind === "review";
  const files = projectFiles({ title: values.title, owner: values.owner, rigor: values.rigor, kind: values.kind });
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, file)), { recursive: true });
    writeFileSync(join(folder, file), text);
  }
  for (const empty of review
    ? ["synthesis/figures", "reviews"]
    : ["study/results", "paper/figures", "paper/build", "reviews"])
    mkdirSync(join(folder, empty), { recursive: true });
  console.log(`Created ${review ? "review " : ""}project: ${folder}`);
  for (const line of [
    "  brief.md                the research brief",
    "  sources/                sources.md (source ledger), searches.jsonl (search ledger), saved copies",
    ...(review
      ? [
          "  synthesis/              evidence-table.md, recheck.md, effects.json (stats.mjs effect), pooling.json (stats.mjs meta),",
          "                          flow.json (artifact.mjs counts --flow), figures/ (specs and SVGs), runs.jsonl (paper.mjs run)",
        ]
      : ["  study/                  plan.md (artifact.mjs init study-plan), runs.jsonl, deviations.jsonl, results/"]),
    "  claims.md               the claims register",
    "  report.md               the research report, when there is one",
    ...(review
      ? []
      : [
          "  paper/                  outline.md, paper.md, figures/ (specs and SVGs), refs.bib, build/, runs.jsonl, rebuttal.md",
        ]),
    "  reviews/                review briefs and reports; support-packets.jsonl and support-verdicts.jsonl",
    "Check it with research.mjs gate <folder>.",
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
  // --sources and --recheck on a kind that does not read them are noted and ignored, so one command form validates
  // every artifact of a project.
  const ignored = [];
  if (values.sources && !["claims-register", "evidence-table", "recheck"].includes(kind)) ignored.push("--sources");
  if (values.recheck && kind !== "claims-register") ignored.push("--recheck");
  const options = {};
  if (values.sources && !ignored.includes("--sources")) options.ledger = ledgerRows(read(values.sources));
  // The recheck table's path as the register's Source would cite it, relative to the register.
  if (values.recheck && !ignored.includes("--recheck"))
    options.rechecks = {
      flags: recheckFlags(read(values.recheck)),
      problems: validate("recheck", read(values.recheck)).problems,
      file: relative(dirname(resolve(path)), resolve(values.recheck))
        .split("\\")
        .join("/"),
    };
  if (values.plan) {
    read(values.plan);
    const state = lockState(values.plan);
    options.plan = {
      hypotheses: planHypotheses(read(values.plan)),
      locked: state.locked,
      reason: state.reason,
      demoted: demotedHypotheses(state.lock),
      labelledByModel: planLabelsByModel(read(values.plan)),
      // A result file the register cites (relative to the register): its numbers, every computed_by its JSON records,
      // and the last receipt in the plan's run ledger that wrote it as it is now and ran stats.mjs (null when none).
      resultFile: (file) => {
        const full = resolve(dirname(path), file);
        let text;
        try {
          text = readFileSync(full, "utf8");
        } catch {
          return null;
        }
        const computedBy = [];
        try {
          const walk = (value) => {
            if (value && typeof value === "object") {
              if (typeof value.computed_by === "string") computedBy.push(value.computed_by);
              Object.values(value).forEach(walk);
            }
          };
          walk(JSON.parse(text));
        } catch {
          // not JSON: no computed_by
        }
        const hash = fileHash(full);
        const folder = dirname(resolve(values.plan));
        // The receipt ran stats.mjs itself (as the program, or as node's script), under a locked version of this plan.
        const lockedHashes = new Set((lockState(values.plan).lock?.entries ?? []).map((entry) => entry.sha256));
        const ranStats = (argv = []) => argv.slice(0, 2).some((arg) => /(?:^|[/\\])stats\.mjs$/.test(arg));
        const receipt =
          readLedger(join(folder, "runs.jsonl"))
            .filter((record) =>
              (record.outputs ?? []).some((output) => resolve(folder, output.path) === full && output.sha256 === hash),
            )
            .filter((record) => ranStats(record.argv) && record.plan_locked && lockedHashes.has(record.plan_sha256))
            .at(-1) ?? null;
        return { numbers: resultNumbers(text, file), computedBy, receipt };
      },
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
  if (kind === "search-ledger") Object.assign(options, screenerFiles(path, text));
  const confirmatory = rows.some((row) => row.cells.Kind === "confirmatory");
  const result = validate(kind, text, options);
  if (values.json) console.log(JSON.stringify({ path, ...result }, null, 2));
  else {
    console.log(`${path}: ${kind}, ${result.valid ? "valid" : `${result.problems.length} problem(s)`}`);
    for (const problem of result.problems) console.log(`  problem: ${problem}`);
    for (const flag of ignored) console.log(`  note: ${flag} does not apply to a ${kind}, so it was ignored`);
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
  const text = read(path);
  const result = searchCounts(text, screenerFiles(path, text));
  // The flow is written only from a ledger that validates, so a figure drawn from it never shows a refused count. It
  // names the ledger and its hash, so the figure can recompute it and refuse a flow the ledger does not give.
  if (values.flow && result.problems.length === 0) {
    mkdirSync(dirname(values.flow), { recursive: true });
    const ledger = { ledger: relative(dirname(resolve(values.flow)), resolve(path)), ledger_sha256: fileHash(path) };
    writeFileSync(values.flow, `${JSON.stringify({ ...result.flow, ...ledger }, null, 2)}\n`);
  }
  if (values.json) console.log(JSON.stringify({ path, ...result }, null, 2));
  else {
    const { total } = result;
    console.log(
      `${path}: ${total.hits} hits; included ${total.included}, excluded ${total.excluded}, duplicate ${total.duplicate}, unscreened ${total.unscreened}`,
    );
    for (const [id, query] of Object.entries(result.queries)) {
      const where =
        query.method === "citation"
          ? `citation ${query.direction} from ${(query.from ?? []).join(", ")}`
          : query.database;
      const returned =
        query.returned !== undefined
          ? `; returned ${query.returned}, ${Math.max(0, query.returned - (query.included + query.excluded + query.duplicate + query.unscreened))} not screened`
          : "";
      console.log(
        `  ${id} ${where} ${query.date}: included ${query.included}, excluded ${query.excluded}, duplicate ${query.duplicate}, unscreened ${query.unscreened}${returned}${query.query ? ` (${query.query})` : ""}`,
      );
    }
    const { flow } = result;
    if (flow.not_screened > 0)
      console.log(`  identified but not screened: ${flow.not_screened} (returned by a service, no hit line)`);
    if (flow.agent_alone)
      console.log(
        `  screened by the reviewing agent alone, no second screener: ${flow.agent_alone.records} (${flow.agent_alone.agents.join(", ")}); name it in the report's Limits`,
      );
    const reasons = (group) =>
      group.reasons.map(
        (reason) => `${reason.criterion ? `${reason.criterion} ` : ""}${reason.reason}: ${reason.records}`,
      );
    for (const [label, group] of [
      ["at title-abstract", flow.excluded_title_abstract],
      ["at full-text", flow.full_text?.excluded],
      ["with no stage recorded", flow.excluded_stage_not_recorded],
    ])
      if (group && group.records > 0 && (group !== flow.excluded_stage_not_recorded || group.records < total.excluded))
        console.log(`  excluded ${label}: ${group.records} (${reasons(group).join("; ")})`);
    for (const agreement of result.agreement) {
      const kappa =
        agreement.kappa === null ? "kappa undefined (one answer only)" : `kappa ${agreement.kappa.toFixed(3)}`;
      console.log(
        `  agreement ${agreement.screeners.join(" and ")} (${agreement.stage}): ${agreement.items} hits, raw ${agreement.observed.toFixed(3)}, ${kappa}, ${agreement.disagreements} disagreement${agreement.disagreements === 1 ? "" : "s"}${agreement.unsettled > 0 ? `, ${agreement.unsettled} not yet settled by a person` : ""}`,
      );
    }
    for (const problem of result.problems) console.log(`  problem: ${problem}`);
    if (values.flow)
      console.log(
        result.problems.length === 0 ? `  flow: ${values.flow}` : "  flow: not written, since the ledger has problems",
      );
  }
  process.exit(result.problems.length === 0 ? 0 : 1);
} else {
  fail(USAGE);
}
