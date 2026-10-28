// Research Work's artifact formats: what each file holds, a skeleton to start one, and a validator that refuses a
// file breaking its contract. The contract itself is written for agents in references/artifacts.md; this module is
// its enforcement. Markdown artifacts carry Write Docs' header (Type, Status, Owner, Source); the search ledger is
// JSONL, one record per line. The study's run ledger and deviation log are written by study.mjs (lib/study.mjs).

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { CHECKS, recheck, statusCell } from "./recheck.mjs";
import { numberInResults, numbersIn, resultCitations } from "./report.mjs";
import { cohenKappa } from "./stats.mjs";

export const STATUSES = ["Draft", "Reviewed", "Accepted", "Rejected", "Superseded", "Retired"];
export const RIGOR = ["check", "study", "publication"];
export const LOOKUP = ["verified", "unresolved", "refuted", "not-looked-up"];
export const CHECKED = ["opened", "repository-read", "ran", "abstract", "summary-only", "memory"];
export const READ = ["full", "partial", "abstract", "none"];
export const LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"];
export const KINDS = ["confirmatory", "exploratory"];
export const HIT_STATES = ["included", "excluded", "duplicate", "unscreened"];
export const CONTROL_RESULTS = ["passed", "failed", "not run"];

/**
 * The twelve questions a study plan answers, as its numbered sections. At check rigor a plan answers 1, 3, 4, 5 and
 * 10; at study and publication rigor, all twelve.
 */
export const QUESTIONS = [
  "The claim",
  "Who uses it",
  "The prediction",
  "Compared to what",
  "The unit and the count",
  "Validity",
  "Reliability",
  "Raw outputs first",
  "Rival explanations",
  "The interval",
  "Fixed before the data",
  "Where it holds",
];
export const CHECK_QUESTIONS = [1, 3, 4, 5, 10];
export const questionHeading = (number) => `${number}. ${QUESTIONS[number - 1]}`;

/**
 * How a source was checked caps the level of a claim resting on it: a source known only from a summary or from
 * memory supports at most L1 (reported); one only seen as an abstract, at most L1 too, since its method was not
 * read; one opened, read in a repository at a pinned commit, or run, at most L5.
 */
export const LEVEL_CAP = {
  opened: "L5",
  "repository-read": "L5",
  ran: "L5",
  abstract: "L1",
  "summary-only": "L1",
  memory: "L1",
};

const BRIEF_SECTIONS = ["Question", "Reader and decision", "Claim sought", "Prediction", "Scope", "Constraints"];
const LEDGER_COLUMNS = ["ID", "Source", "Pin", "Lookup", "Checked", "Read", "Supports"];
const REGISTER_COLUMNS = ["ID", "Claim", "Numbers", "Source", "Level", "Kind", "Scope", "Limit"];
const HYPOTHESIS_COLUMNS = ["ID", "Hypothesis", "Kind", "Metric", "Decision rule"];
// The Method column, optional so plans locked before it existed stay valid: the stats.mjs family and method that
// computes the decision rule ("paired mcnemar"), or "computed: <how>" for a quantity computed another way.
const HYPOTHESIS_COLUMNS_WITH_METHOD = [...HYPOTHESIS_COLUMNS, "Method"];
// A test and the correction applied to it are listed in order, separated by ";": "paired mcnemar; correct holm".
const METHOD =
  /^(?:[a-z]+(?:-[a-z]+)* [a-z0-9]+(?:-[a-z0-9]+)*(?:\s*;\s*[a-z]+(?:-[a-z]+)* [a-z0-9]+(?:-[a-z0-9]+)*)*|computed: \S.*)$/;
const RUN_COLUMNS = ["Unit", "Arm", "Trials"];
// An optional fourth column says which split a planned unit belongs to.
const RUN_COLUMNS_WITH_SPLIT = [...RUN_COLUMNS, "Split"];
// Budget, optional: the tuning effort and compute an arm gets, or "control" for a do-nothing or oracle arm.
const RUN_COLUMN_SETS = [
  RUN_COLUMNS,
  RUN_COLUMNS_WITH_SPLIT,
  [...RUN_COLUMNS, "Budget"],
  [...RUN_COLUMNS_WITH_SPLIT, "Budget"],
];
const CONTAMINATION_COLUMNS = ["Route", "Control"];
// The ways a measured answer can leak into what is measured, each with its control or "unknown".
export const CONTAMINATION_ROUTES = [
  "training data",
  "prompts and examples",
  "tuning",
  "tools and web",
  "grader and harness",
];
const VARIANT_COLUMNS = ["ID", "Variant", "What it changes"];
const MODEL_COLUMNS = ["Role", "Model", "Snapshot", "Accessed"];
export const SPLITS = ["tuning", "held-out"];
const CONTRIBUTION_COLUMNS = ["ID", "Contribution", "Claims"];
const PARAGRAPH_COLUMNS = ["Section", "Paragraph", "Role", "Claims"];
const FIGURE_COLUMNS = ["ID", "Figure", "Claims", "Data", "File", "Receipt"];
const OBJECTION_COLUMNS = ["Objection", "Answered in"];
const REBUTTAL_COLUMNS = ["ID", "Reviewer", "Round", "Comment", "Choice", "Reason", "Commitment", "Fulfilled", "New"];
export const CHOICES = ["will address", "won't", "not on point"];
export const REBUTTAL_STAGES = ["drafted", "submitted"];
const EVIDENCE_COLUMNS = ["Source", "Design", "n", "Result", "Failure condition", "Level"];
const EVIDENCE_COLUMNS_WITH_WEAKNESS = [...EVIDENCE_COLUMNS, "Weakness"];
// Risk of bias, optional: the tool that assessed it for the study's design, and the tool's overall judgment.
const BIAS_COLUMNS = ["Bias tool", "Risk of bias"];
const EVIDENCE_COLUMN_SETS = [
  EVIDENCE_COLUMNS,
  EVIDENCE_COLUMNS_WITH_WEAKNESS,
  [...EVIDENCE_COLUMNS, ...BIAS_COLUMNS],
  [...EVIDENCE_COLUMNS_WITH_WEAKNESS, ...BIAS_COLUMNS],
];
export const RISK_OF_BIAS = ["low", "some concerns", "high", "not assessed"];
const RECHECK_COLUMNS = ["ID", "Source", "Where", "Check", "Reported", "Status"];
const JUDGE_FIELDS = [
  "Judge",
  "Rubric",
  "Rubric sha256",
  "Gold items",
  "Agreement",
  "Interval",
  "Required lower bound",
  "Both orders",
  "Length control",
  "Decoys",
  "Repeatability",
  "Judge and graded",
  "Result",
];

export const KINDS_OF_ARTIFACT = {
  "research-brief": { type: "Research Brief", file: "brief.md" },
  "source-ledger": { type: "Source Ledger", file: "sources.md" },
  "search-ledger": { type: null, file: "search.jsonl" },
  "claims-register": { type: "Claims Register", file: "claims.md" },
  "study-plan": { type: "Study Plan", file: "plan.md" },
  "judge-validation": { type: "Judge Validation", file: "judge-validation.md" },
  "paper-outline": { type: "Paper Outline", file: "outline.md" },
  rebuttal: { type: "Rebuttal", file: "rebuttal.md" },
  "evidence-table": { type: "Evidence Table", file: "evidence.md" },
  recheck: { type: "Recheck Table", file: "recheck.md" },
};

const levelRank = (level) => LEVELS.indexOf(level);

// ---------------------------------------------------------------------------------------------------------------
// Skeletons

/** The starting text of a new artifact. Placeholders are in angle brackets, which validation refuses. */
export function skeleton(kind, { title, owner, rigor = "study" }) {
  if (kind === "search-ledger") return "";
  const type = KINDS_OF_ARTIFACT[kind]?.type;
  if (!type)
    throw new Error(`unknown artifact kind "${kind}"; choose one of: ${Object.keys(KINDS_OF_ARTIFACT).join(", ")}`);
  const header = [`# ${type}: ${title}`, "", `> **Type:** ${type}`, "> **Status:** Draft", `> **Owner:** ${owner}`];
  if (kind === "research-brief" || kind === "study-plan") {
    if (!RIGOR.includes(rigor)) throw new Error(`rigor must be one of: ${RIGOR.join(", ")}`);
    header.push(`> **Rigor:** ${rigor}`);
  }
  if (kind === "judge-validation") {
    header.push(
      "> **Judge:** <model, version and settings>",
      "> **Rubric:** <path to the frozen rubric>",
      "> **Rubric sha256:** <sha256 of the rubric file>",
      "> **Gold items:** <how many items with known answers>",
      "> **Agreement:** <agreement with the gold answers, 0 to 1>",
      "> **Interval:** <[low, high] and its method, from stats.mjs>",
      "> **Required lower bound:** <the lowest interval bound the study accepts, fixed before scoring>",
      "> **Both orders:** <passed, failed, not run, or not applicable when the judge rates one output at a time>",
      "> **Length control:** <passed, failed or not run>",
      "> **Decoys:** <passed, failed or not run>",
      "> **Repeatability:** <passed, failed or not run: the judge's agreement with itself on a rerun>",
      "> **Judge and graded:** <different family, different model, or same model: why no other was available>",
      "> **Result:** <pass or fail>",
    );
  }
  if (kind === "paper-outline")
    header.push(
      "> **Register:** <path to the claims register the paper draws on>",
      "> **Runs:** <the run ledger holding the figures' receipts, or none>",
    );
  if (kind === "rebuttal") header.push("> **Stage:** drafted", "> **Paper:** <path or version of the paper reviewed>");
  const table = (columns, row) => [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    row,
    "",
  ];
  const lines = [...header, ""];
  if (kind === "paper-outline") {
    lines.push(
      "## Proposition",
      "",
      "<the paper's one message, as a sentence a result could contradict>",
      "",
      "## Contributions",
      "",
      ...table(CONTRIBUTION_COLUMNS, "| K1 | <a refutable contribution> | <claim IDs, such as C1; C2> |"),
      "## Paragraphs",
      "",
      ...table(PARAGRAPH_COLUMNS, "| <section> | <the paragraph's one sentence> | <its role> | <claim IDs, or -> |"),
      "## Figures",
      "",
      ...table(
        FIGURE_COLUMNS,
        "| F1 | <what it shows> | <claim IDs> | <path to its data file> | <path to the figure file> | <its receipt R<n>, or - until drawn> |",
      ),
      "## Objections",
      "",
      ...table(OBJECTION_COLUMNS, "| <the strongest objection> | <the section that answers it> |"),
      "## Limits",
      "",
      "<where the limits are stated, once>",
      "",
    );
  } else if (kind === "rebuttal") {
    lines.push(
      ...table(
        REBUTTAL_COLUMNS,
        "| R1 | <reviewer> | 1 | <the comment, quoted> | <will address, won't, or not on point> | <why> | <what you commit to, or -> | <where it is done, or -> | - |",
      ),
    );
  } else if (kind === "evidence-table") {
    lines.push(
      ...table(
        EVIDENCE_COLUMNS,
        "| <S ID> | <the study's design> | <n, or -> | <its result> | <the result that would have refuted it> | <L0 to L5> |",
      ),
    );
  } else if (kind === "recheck") {
    lines.push(
      ...table(
        RECHECK_COLUMNS,
        `| N1 | <S ID> | <page, table or line> | <${CHECKS.join(", ")}> | <the reported text, copied exactly> | - |`,
      ),
    );
  } else if (kind === "research-brief") {
    lines.push(
      "## Question",
      "",
      "<one sentence, without jargon, naming the quantity, the comparison and the scope>",
      "",
      "## Reader and decision",
      "",
      "<who uses the result, and what changes under each outcome>",
      "",
      "## Claim sought",
      "",
      "<the claim the work should let you make, or 'none: a descriptive report'>",
      "",
      "## Prediction",
      "",
      "<what you expect and the result that counts as failure, written now; or 'none: a descriptive report'>",
      "",
      "## Scope",
      "",
      "- In: <what the work covers>",
      "- Out: <what it leaves out>",
      "",
      "## Constraints",
      "",
      "- <each constraint in the user's words, with the date it was given; or 'none'>",
      "",
    );
  } else if (kind === "study-plan") {
    const numbers = rigor === "check" ? CHECK_QUESTIONS : QUESTIONS.map((_, index) => index + 1);
    // Question 3 states the size, so its placeholder asks for the power computation the validator looks for.
    for (const number of numbers)
      lines.push(
        `## ${questionHeading(number)}`,
        "",
        number === 3
          ? "<the prediction: the primary metric, the smallest effect worth detecting, and the power computation (stats.mjs power) that sized the study, or why none applies>"
          : number === 4
            ? "<how it is done today; the baseline and a trivial baseline; the tuning and compute each arm gets; the baseline's number reproduced here beside its published one>"
            : number === 7
              ? "<the noise floor, measured on a frozen pilot; each source of variance and how it is controlled: prompt format and wording, seeds and sampling, environment and versions, run order>"
              : "<the answer, before any data>",
        "",
      );
    lines.push(
      "## Hypotheses",
      "",
      `| ${HYPOTHESIS_COLUMNS_WITH_METHOD.join(" | ")} |`,
      `| ${HYPOTHESIS_COLUMNS_WITH_METHOD.map(() => "---").join(" | ")} |`,
      "| C1 | <what the study tests> | confirmatory | <the primary metric> | <the rule that decides it> | <the stats.mjs family and method that computes it, such as paired mcnemar, or computed: how> |",
      "",
      "## Planned runs",
      "",
      `| ${[...RUN_COLUMNS, "Budget"].join(" | ")} |`,
      `| ${[...RUN_COLUMNS, "Budget"].map(() => "---").join(" | ")} |`,
      "| <unit> | <arm> | <trials> | <the tuning effort and compute this arm gets, the same for every arm compared; control for a do-nothing or oracle arm> |",
      "",
      ...(rigor === "check"
        ? []
        : [
            "## Analysis variants",
            "",
            `| ${VARIANT_COLUMNS.join(" | ")} |`,
            `| ${VARIANT_COLUMNS.map(() => "---").join(" | ")} |`,
            "| V1 | <another reasonable analysis> | <what it changes: the exclusions, the unit, the metric> |",
            "",
            "## Models in the method",
            "",
            `| ${MODEL_COLUMNS.join(" | ")} |`,
            `| ${MODEL_COLUMNS.map(() => "---").join(" | ")} |`,
            "| <judge, annotator, generator or subject> | <the model> | <its exact snapshot> | <YYYY-MM-DD> |",
            "",
            "## Contamination",
            "",
            `| ${CONTAMINATION_COLUMNS.join(" | ")} |`,
            `| ${CONTAMINATION_COLUMNS.map(() => "---").join(" | ")} |`,
            ...CONTAMINATION_ROUTES.map((route) => `| ${route} | <how this route is controlled, or unknown> |`),
            "",
          ]),
      "## Amendments",
      "",
      "none",
      "",
    );
  } else if (kind === "judge-validation") {
    lines.push("## Notes", "", "<how the gold set was built, and what the decoys were>", "");
  } else if (kind === "source-ledger") {
    lines.push(`| ${LEDGER_COLUMNS.join(" | ")} |`, `| ${LEDGER_COLUMNS.map(() => "---").join(" | ")} |`, "");
  } else {
    lines.push(`| ${REGISTER_COLUMNS.join(" | ")} |`, `| ${REGISTER_COLUMNS.map(() => "---").join(" | ")} |`, "");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing

/** The title line, the `> **Field:** value` header, and the `## ` sections of a Markdown artifact. */
export function parseMarkdown(text) {
  const lines = text.split(/\r?\n/);
  const title =
    lines
      .find((line) => line.startsWith("# "))
      ?.slice(2)
      .trim() ?? null;
  const header = {};
  for (const line of lines) {
    const match = /^>\s*\*\*([^*]+):\*\*\s*(.*)$/.exec(line);
    if (match) header[match[1].trim()] = match[2].trim();
  }
  const sections = new Map();
  // Each section's heading line (1-based), so a problem in a section's table names its line in the file.
  const starts = new Map();
  let current = null;
  lines.forEach((line, index) => {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      sections.set(current, []);
      starts.set(current, index + 1);
    } else if (current !== null) sections.get(current).push(line);
  });
  return { title, header, sections, starts, lines };
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

/** The first Markdown table in the lines: its header cells and each body row as an object, with its line number. */
export function parseTable(lines) {
  const start = lines.findIndex((line) => line.trim().startsWith("|"));
  if (start < 0) return null;
  const columns = splitRow(lines[start]);
  const rows = [];
  for (let index = start + 2; index < lines.length && lines[index].trim().startsWith("|"); index += 1) {
    const cells = splitRow(lines[index]);
    rows.push({
      line: index + 1,
      cells: Object.fromEntries(columns.map((column, at) => [column, cells[at] ?? ""])),
      width: cells.length,
    });
  }
  return { columns, rows, separator: lines[start + 1] ?? "" };
}

// A placeholder is angle brackets around words, as the skeletons write them ("<what the work covers>"); a comparison
// such as "x < 3 and y > 2" or "p<0.05" is not one.
const placeholder = (text) => /(?<![\w<])<[A-Za-z][^<>\n]*[^\s<>]>/.test(text);

// ---------------------------------------------------------------------------------------------------------------
// Validation

function validateHeader(parsed, type, problems) {
  if (!parsed.title) problems.push("missing the '# ' title line");
  else if (!parsed.title.startsWith(`${type}: `)) problems.push(`the title must start with "${type}: "`);
  if (parsed.header.Type !== type) problems.push(`the header's Type must be "${type}"`);
  if (!STATUSES.includes(parsed.header.Status))
    problems.push(`the header's Status must be one of: ${STATUSES.join(", ")}`);
  if (!parsed.header.Owner) problems.push("the header needs an Owner");
  if (parsed.header.Status === "Accepted" && !parsed.header.Source)
    problems.push("an Accepted artifact needs a Source naming where it was accepted");
}

function validateTable(parsed, expected, problems) {
  const table = parseTable(parsed.lines);
  if (!table) {
    problems.push(`missing the table with columns: ${expected.join(", ")}`);
    return null;
  }
  if (table.columns.join("|") !== expected.join("|"))
    problems.push(`the table's columns must be, in order: ${expected.join(", ")}`);
  for (const row of table.rows) {
    if (row.width !== expected.length)
      problems.push(`line ${row.line}: expected ${expected.length} cells, found ${row.width}`);
  }
  return table;
}

function validateBrief(parsed, problems) {
  validateHeader(parsed, "Research Brief", problems);
  if (!RIGOR.includes(parsed.header.Rigor)) problems.push(`the header's Rigor must be one of: ${RIGOR.join(", ")}`);
  for (const name of BRIEF_SECTIONS) {
    const body = (parsed.sections.get(name) ?? []).join("\n").trim();
    if (!parsed.sections.has(name)) problems.push(`missing section "## ${name}"`);
    else if (body === "") problems.push(`section "${name}" is empty`);
    else if (placeholder(body)) problems.push(`section "${name}" still has a <placeholder>`);
  }
  const scope = (parsed.sections.get("Scope") ?? []).join("\n");
  if (parsed.sections.has("Scope") && !(/^- In:/m.test(scope) && /^- Out:/m.test(scope))) {
    problems.push('section "Scope" needs a "- In:" line and a "- Out:" line');
  }
}

/** The ## sections of a parsed plan whose body is the table under that heading. */
function sectionTable(parsed, name) {
  return parsed.sections.has(name) ? parseTable(parsed.sections.get(name)) : null;
}

/** A study plan's hypotheses, by claim ID: `{ kind, metric, rule }`. */
export function planHypotheses(text) {
  const table = sectionTable(parseMarkdown(text), "Hypotheses");
  return new Map(
    (table?.rows ?? []).map((row) => [
      row.cells.ID,
      {
        kind: row.cells.Kind,
        metric: row.cells.Metric,
        rule: row.cells["Decision rule"],
        method: row.cells.Method && row.cells.Method !== "-" ? row.cells.Method : null,
      },
    ]),
  );
}

/** A study plan's analysis variants, by ID: none when the section is missing or says "none". */
export function planVariants(text) {
  const lines = sectionNamed(parseMarkdown(text), "Analysis variants");
  return (lines ? (parseTable(lines)?.rows ?? []) : [])
    .map((row) => row.cells.ID)
    .filter((id) => id && !placeholder(id));
}

/** A section's lines, its heading matched without regard to case ("## Analysis Variants" is the same section). */
function sectionNamed(parsed, name) {
  for (const [heading, lines] of parsed.sections) if (heading.toLowerCase() === name.toLowerCase()) return lines;
  return null;
}

export const MODEL_ROLES = ["judge", "annotator", "generator", "subject"];
const UNPINNED = ["latest", "current", "default", "newest", "stable"];

/** Whether a YYYY-MM-DD string is a real calendar date no later than today. */
function pastDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text && date.getTime() <= Date.now();
}

/** The plan's optional sections, checked when present: each is a table with its columns, or the word "none". */
function validateOptionalPlanSections(parsed, problems) {
  const contamination = sectionNamed(parsed, "Contamination");
  if (contamination) {
    const table = parseTable(contamination);
    if (!table || table.columns.join("|") !== CONTAMINATION_COLUMNS.join("|"))
      problems.push(
        `the Contamination section must be one table with the columns: ${CONTAMINATION_COLUMNS.join(", ")}`,
      );
    else {
      const routes = table.rows.map((row) => String(row.cells.Route ?? "").toLowerCase());
      for (const route of CONTAMINATION_ROUTES)
        if (!routes.includes(route)) problems.push(`the Contamination table has no row for "${route}"`);
      for (const route of routes)
        if (!CONTAMINATION_ROUTES.includes(route))
          problems.push(`the Contamination table's Route "${route}" is not one of: ${CONTAMINATION_ROUTES.join(", ")}`);
      for (const { cells } of table.rows)
        if (!cells.Control || cells.Control === "-" || placeholder(cells.Control))
          problems.push(`Contamination row ${cells.Route}: Control must say how the route is controlled, or unknown`);
    }
  }
  for (const [name, columns] of [
    ["Analysis variants", VARIANT_COLUMNS],
    ["Models in the method", MODEL_COLUMNS],
  ]) {
    const lines = sectionNamed(parsed, name);
    if (!lines) continue;
    if (lines.join("\n").trim().toLowerCase() === "none") continue;
    const table = parseTable(lines);
    if (!table || table.columns.join("|") !== columns.join("|")) {
      problems.push(`the ${name} section must be "none" or one table with the columns: ${columns.join(", ")}`);
      continue;
    }
    if (table.rows.length === 0) problems.push(`the ${name} table has no rows; write "none" instead`);
    const seen = new Set();
    for (const { cells, width } of table.rows) {
      if (width !== columns.length) {
        problems.push(`the ${name} table has a row with ${width} cells; it needs ${columns.length}`);
        continue;
      }
      if (Object.values(cells).some((cell) => !cell || placeholder(cell))) {
        problems.push(`the ${name} section still has an empty cell or a <placeholder>`);
        continue;
      }
      if (name === "Analysis variants") {
        if (!/^V\d+$/.test(cells.ID))
          problems.push(`Analysis variants row ${cells.ID}: ID must be V followed by a number`);
        else if (seen.has(cells.ID)) problems.push(`Analysis variants row ${cells.ID}: duplicate ID`);
        seen.add(cells.ID);
      } else {
        const where = `Models in the method row ${cells.Model}`;
        if (!MODEL_ROLES.includes(cells.Role.toLowerCase()))
          problems.push(`${where}: Role must be one of: ${MODEL_ROLES.join(", ")}`);
        if (
          UNPINNED.includes(cells.Snapshot.toLowerCase()) ||
          cells.Snapshot.toLowerCase() === cells.Model.toLowerCase()
        )
          problems.push(`${where}: Snapshot must name the exact version, not "${cells.Snapshot}"`);
        if (!pastDate(cells.Accessed))
          problems.push(`${where}: Accessed must be a real date, YYYY-MM-DD, no later than today`);
      }
    }
  }
}

/** A study plan's planned runs: `{ unit, arm, trials }` per row. */
export function plannedRuns(text) {
  const table = sectionTable(parseMarkdown(text), "Planned runs");
  return (table?.rows ?? []).map((row) => ({
    unit: row.cells.Unit,
    arm: row.cells.Arm,
    trials: Number(row.cells.Trials),
    split: row.cells.Split ?? null,
    budget: row.cells.Budget ?? null,
  }));
}

/** Whether a plan's Hypotheses table has the Method column, and whether any hypothesis is confirmatory. */
export function planHypothesesTable(text) {
  const table = sectionTable(parseMarkdown(text), "Hypotheses");
  return {
    withMethod: table?.columns.includes("Method") ?? false,
    confirmatory: (table?.rows ?? []).some((row) => row.cells.Kind === "confirmatory"),
  };
}

/** Whether a plan lists a model whose labels or verdicts feed the analysis: a judge or an annotator. */
export function planLabelsByModel(text) {
  const lines = sectionNamed(parseMarkdown(text), "Models in the method");
  return (lines ? (parseTable(lines)?.rows ?? []) : []).some((row) =>
    ["judge", "annotator"].includes(String(row.cells.Role ?? "").toLowerCase()),
  );
}

function validatePlan(parsed, problems) {
  validateHeader(parsed, "Study Plan", problems);
  if (!RIGOR.includes(parsed.header.Rigor)) problems.push(`the header's Rigor must be one of: ${RIGOR.join(", ")}`);
  const required = parsed.header.Rigor === "check" ? CHECK_QUESTIONS : QUESTIONS.map((_, index) => index + 1);
  for (const number of required) {
    const name = questionHeading(number);
    const body = (parsed.sections.get(name) ?? []).join("\n").trim();
    if (!parsed.sections.has(name)) problems.push(`missing section "## ${name}"`);
    else if (body === "") problems.push(`section "${name}" is empty`);
    else if (placeholder(body)) problems.push(`section "${name}" still has a <placeholder>`);
  }
  const hypotheses = sectionTable(parsed, "Hypotheses");
  if (!hypotheses) problems.push(`missing "## Hypotheses" with the table: ${HYPOTHESIS_COLUMNS.join(", ")}`);
  else {
    const withMethod = hypotheses.columns.join("|") === HYPOTHESIS_COLUMNS_WITH_METHOD.join("|");
    if (hypotheses.columns.join("|") !== HYPOTHESIS_COLUMNS.join("|") && !withMethod)
      problems.push(
        `the Hypotheses table's columns must be, in order: ${HYPOTHESIS_COLUMNS.join(", ")}, and optionally Method`,
      );
    if (hypotheses.rows.length === 0) problems.push("the Hypotheses table has no rows");
    const seen = new Set();
    for (const { cells } of hypotheses.rows) {
      const where = `Hypotheses row ${cells.ID || "?"}`;
      if (!/^C\d+$/.test(cells.ID)) problems.push(`${where}: ID must be a claim ID, C followed by a number`);
      else if (seen.has(cells.ID)) problems.push(`${where}: duplicate ID`);
      seen.add(cells.ID);
      if (!KINDS.includes(cells.Kind)) problems.push(`${where}: Kind must be one of: ${KINDS.join(", ")}`);
      for (const column of ["Hypothesis", "Metric", "Decision rule"]) {
        if (placeholder(cells[column] ?? "")) problems.push(`${where}: ${column} still has a <placeholder>`);
      }
      if (cells.Kind === "confirmatory" && [cells.Metric, cells["Decision rule"]].some((cell) => !cell || cell === "-"))
        problems.push(`${where}: a confirmatory hypothesis names its metric and its decision rule`);
      if (withMethod && cells.Kind === "confirmatory" && !METHOD.test(cells.Method ?? ""))
        problems.push(
          `${where}: Method names the stats.mjs family and method that computes the rule (such as paired mcnemar), or "computed: <how>"`,
        );
    }
  }
  // The plan's own text: the twelve answers and the decision rules, where a stop rule or a size would be stated.
  const planText = [
    ...QUESTIONS.map((_, index) => (parsed.sections.get(questionHeading(index + 1)) ?? []).join("\n")),
    ...(hypotheses?.rows ?? []).map((row) => row.cells["Decision rule"] ?? ""),
  ].join("\n");
  // Stopping when a result turns significant inflates false positives unless the test is built for looking often.
  // These checks read the wording, so they catch the common ways of writing it, not every one.
  const stopsOnSignificance =
    /\b(stop\w*|halt\w*|terminat\w*|end(s|ed|ing)? (the |this )?(study|run|collection|data|trials?|experiment)|until|as soon as|once (the|a|it|p)\b)[^.;\n]{0,60}(significan|\bp\s*[<≤]|p-value)/i;
  const sequentialTests =
    /group[- ]sequential|alpha[- ]spending|always[- ]valid|o['’]?brien[- ]fleming|pocock|\bsprt\b|sequential probability ratio|confidence sequences?|\be-values?\b|sequential test/gi;
  const namesSequentialTest = [...planText.matchAll(sequentialTests)].some(
    (match) =>
      !/\b(no|not|without|never|nor)\b[^.\n]*$/i.test(planText.slice(Math.max(0, match.index - 40), match.index)),
  );
  if (stopsOnSignificance.test(planText) && !namesSequentialTest)
    problems.push(
      "the plan stops when a result turns significant; fix the count in advance, or name a sequential test built for repeated looks",
    );
  // A size is a computation: power with its numbers, the stats.mjs command that computed it, or why none applies.
  const comparison = (hypotheses?.rows ?? []).some((row) => row.cells.Kind === "confirmatory");
  const statesSize =
    /\bpower\b[^.\n]{0,80}\d|\d[^.\n]{0,80}\bpower\b|\bpower (mcnemar|paired)-cases\b|not a sampling question|computed,? not (sampled|estimated)/i;
  if (comparison && !statesSize.test(planText))
    problems.push(
      "a confirmatory hypothesis needs its size: a power computation (stats.mjs power) in question 3, or the reason none applies (a computed quantity, not a sample)",
    );
  const runs = sectionTable(parsed, "Planned runs");
  if (!runs) problems.push(`missing "## Planned runs" with the table: ${RUN_COLUMNS.join(", ")}`);
  else {
    const withSplit = runs.columns.includes("Split");
    const withBudget = runs.columns.includes("Budget");
    if (!RUN_COLUMN_SETS.some((set) => set.join("|") === runs.columns.join("|")))
      problems.push(
        `the Planned runs table's columns must be, in order: ${RUN_COLUMNS.join(", ")}, then optionally Split, then optionally Budget`,
      );
    if (runs.rows.length === 0) problems.push("the Planned runs table has no rows");
    for (const { cells } of runs.rows) {
      const where = `Planned runs row ${cells.Unit || "?"}`;
      if (!cells.Unit || placeholder(cells.Unit) || !cells.Arm || placeholder(cells.Arm))
        problems.push(`${where}: Unit and Arm must be filled`);
      if (!/^[1-9]\d*$/.test(cells.Trials ?? ""))
        problems.push(`${where}: Trials must be a whole number of at least 1`);
      if (withSplit && !SPLITS.includes(cells.Split))
        problems.push(`${where}: Split must be one of: ${SPLITS.join(", ")}`);
      if (withBudget && (!cells.Budget || cells.Budget === "-" || placeholder(cells.Budget)))
        problems.push(
          `${where}: Budget must say the tuning and compute this arm gets, control, or not compared: <why>`,
        );
    }
    // Equal budgets: unequal tuning alone has reversed published rankings, so the arms a confirmatory hypothesis
    // compares get the same tuning and compute. A do-nothing or oracle arm is marked control.
    const outside = (budget) => /^control$/i.test(budget.trim()) || /^not compared:\s*\S/i.test(budget.trim());
    const budgets = new Set(runs.rows.map((row) => row.cells.Budget).filter((budget) => budget && !outside(budget)));
    if (withBudget && comparison && budgets.size > 1)
      problems.push(
        `the arms get different budgets (${[...budgets].join("; ")}); a confirmatory comparison gives every arm it compares the same tuning and compute, and marks a do-nothing or oracle arm as control, and an arm outside the comparison (a baseline at its published settings) as "not compared: <why>"`,
      );
  }
  validateOptionalPlanSections(parsed, problems);
  if (!parsed.sections.has("Amendments")) problems.push('missing section "## Amendments" ("none" until the first)');
}

/** The controls a passing judge validation record has all passed. */
const CONTROLS = ["Both orders", "Length control", "Decoys", "Repeatability"];
/** Results each control accepts: a judge that rates one output at a time has no answer order to swap. */
const controlResults = (name) => (name === "Both orders" ? [...CONTROL_RESULTS, "not applicable"] : CONTROL_RESULTS);
/** How the judge relates to the model it grades: a different model by default, the same one only with a reason. */
const JUDGE_RELATION = /^(different family|different model|same model: \S.*)$/;

const interval = (text) => {
  const match = /\[\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\]/.exec(text ?? "");
  return match ? { low: Number(match[1]), high: Number(match[2]) } : null;
};

function validateJudge(parsed, problems) {
  validateHeader(parsed, "Judge Validation", problems);
  const field = parsed.header;
  for (const name of JUDGE_FIELDS) {
    if (!field[name]) problems.push(`the header needs ${name}`);
    else if (placeholder(field[name])) problems.push(`${name} still has a <placeholder>`);
  }
  if (field["Rubric sha256"] && !/^[0-9a-f]{64}$/.test(field["Rubric sha256"]))
    problems.push("Rubric sha256 must be 64 lowercase hex characters");
  if (field["Gold items"] && !/^[1-9]\d*$/.test(field["Gold items"]))
    problems.push("Gold items must be a whole number");
  const bounds = interval(field.Interval);
  if (field.Interval && !bounds) problems.push("Interval must hold [low, high]");
  const required = Number(field["Required lower bound"]);
  if (field["Required lower bound"] && !(required >= 0 && required <= 1))
    problems.push("Required lower bound must be a number from 0 to 1");
  for (const name of CONTROLS) {
    if (field[name] && !controlResults(name).includes(field[name]))
      problems.push(`${name} must be one of: ${controlResults(name).join(", ")}`);
  }
  if (field["Judge and graded"] && !JUDGE_RELATION.test(field["Judge and graded"]))
    problems.push(
      'Judge and graded must be "different family", "different model", or "same model: <why no other model was available>"',
    );
  if (field.Result && !["pass", "fail"].includes(field.Result)) problems.push('Result must be "pass" or "fail"');
  if (field.Result === "pass") {
    if (bounds && bounds.low < required)
      problems.push(`Result is pass, but the interval's lower bound ${bounds.low} is below the required ${required}`);
    for (const name of CONTROLS) {
      if (field[name] && field[name] !== "passed" && field[name] !== "not applicable")
        problems.push(`Result is pass, but ${name} is "${field[name]}"`);
    }
  }
}

/**
 * Whether a judge validation record lets the judge's verdicts count: valid, and its Result is pass. `rubricSha256` is
 * the hash of the rubric it was validated on, so a use of the judge can be held to that rubric.
 */
export function judgeCounts(text) {
  const { valid, problems } = validate("judge-validation", text);
  const { header } = parseMarkdown(text);
  return { counts: valid && header.Result === "pass", problems, rubricSha256: header["Rubric sha256"] };
}

/** The judge records a register row's Source cites as `judge:<path>`. */
export const judgeCitations = (source) =>
  [...source.matchAll(/\bjudge:(\S+?)(?=[;,]|\s|$)/g)].map((match) => match[1]).filter((path) => path !== "none");

const PIN = {
  doi: /^doi:10\.\d{4,9}\/\S+$/i,
  arxiv: /^arXiv:\d{4}\.\d{4,5}(v\d+)?$/,
  commit: /^\S+@[0-9a-f]{7,40}$/,
  url: /^https?:\/\/\S+ \(accessed \d{4}-\d{2}-\d{2}\)$/,
  isbn: /^ISBN [0-9X-]{10,17}$/,
};

/** Rows of the source ledger by ID, for a claims register's cross-check. */
export function ledgerRows(text) {
  const table = parseTable(parseMarkdown(text).lines);
  return new Map((table?.rows ?? []).map((row) => [row.cells.ID, row.cells]));
}

function validateLedger(parsed, problems) {
  validateHeader(parsed, "Source Ledger", problems);
  const table = validateTable(parsed, LEDGER_COLUMNS, problems);
  if (!table) return;
  const seen = new Set();
  for (const { line, cells } of table.rows) {
    const where = `line ${line}`;
    if (!/^S\d+$/.test(cells.ID)) problems.push(`${where}: ID must be S followed by a number`);
    else if (seen.has(cells.ID)) problems.push(`${where}: duplicate ID ${cells.ID}`);
    seen.add(cells.ID);
    if (cells.Source === "" || placeholder(cells.Source)) problems.push(`${where}: Source must name the source`);
    if (!LOOKUP.includes(cells.Lookup)) problems.push(`${where}: Lookup must be one of: ${LOOKUP.join(", ")}`);
    if (!CHECKED.includes(cells.Checked)) problems.push(`${where}: Checked must be one of: ${CHECKED.join(", ")}`);
    if (!READ.includes(cells.Read)) problems.push(`${where}: Read must be one of: ${READ.join(", ")}`);
    if (cells.Checked === "memory") {
      if (cells.Pin !== "none") problems.push(`${where}: a source known from memory has Pin "none"`);
    } else if (!Object.values(PIN).some((pattern) => pattern.test(cells.Pin))) {
      problems.push(
        `${where}: Pin must be doi:10.x/..., arXiv:NNNN.NNNNN, <repository>@<commit>, ISBN ..., or a URL followed by "(accessed YYYY-MM-DD)"`,
      );
    }
    if (cells.Read === "none" && ["opened", "repository-read"].includes(cells.Checked)) {
      problems.push(`${where}: a source marked ${cells.Checked} was read, so Read cannot be "none"`);
    }
    if (cells.Supports !== "-" && !/^C\d+(, C\d+)*$/.test(cells.Supports))
      problems.push(`${where}: Supports must be claim IDs (C1, C2) or "-"`);
  }
}

// A claim about absence ("the first to", "no prior work") is only as good as the search behind it (framing.md). The
// check reads three classes of wording: being first, nothing or nobody having done it, and words that say it is new.
// It reads wording, so it catches the common forms, not every one.
const RESEARCH_VERBS =
  "measured|studied|shown|done|tested|examined|compared|proposed|built|reported|explored|investigated|evaluated|addressed|attempted|tried|published|released|described|found|considered";
const ABSENCE = [
  // "We are the first team to...", "This is the first", "for the first time"; not "this was the first run".
  /\b(?:we|this|it|ours?|they|these|the (?:method|approach|tool|system|paper|study|work))\b[^.;]{0,40}?\b(?:is|are|was|were|'s|'re)\s+(?:the\s+)?(?:very\s+)?first\b(?!\s+(?:run|trial|step|attempt|arm|round|batch|iteration|stage|seed|try)\b)/i,
  /\bfor the first time\b/i,
  /\bthe first to (?:show|measure|propose|study|demonstrate|introduce|report|compare|apply|use|build|test)\b/i,
  // "Nobody has done X", "No one else has measured"; not "Nobody has dropped out".
  new RegExp(String.raw`\bno(?:body| one)(?: else)?(?: has| have| had)?\s+(?:ever\s+)?(?:${RESEARCH_VERBS})\b`, "i"),
  // "No tool does Y", "There is no prior research"; not "No other work was excluded".
  /\bno (?:prior |previous |existing |published |other |earlier )?(?:work|research|study|studies|paper|papers|tool|tools|method|methods|system|systems|benchmark|benchmarks|approach|approaches|library|libraries|dataset|datasets)\b(?!\s+(?:was|were|is|are)\s+(?:excluded|dropped|removed|used|included|skipped))/i,
  new RegExp(String.raw`\b(?:has|have|had) (?:never|not)(?: yet)? been (?:${RESEARCH_VERBS})\b`, "i"),
  /\b(?:novel|unprecedented|unexplored|unstudied|understudied|first-of-its-kind)\b/i,
];
const isAbsenceClaim = (claim) => ABSENCE.some((pattern) => pattern.test(claim));

const searchCitations = (cell) => [...cell.matchAll(/\bsearch:(Q\d+)\b/g)].map((match) => match[1]);

/** Source IDs as whole entries of a Source cell (S3, or S3:path for code), not the S3 inside a file name such as no-S3.json. */
function sourceIds(cell) {
  return (cell ?? "")
    .split(/[;,\s]+/)
    .map((entry) => /^(S\d+)(?::|$)/.exec(entry)?.[1])
    .filter(Boolean);
}

function validateRegister(parsed, problems, { ledger, plan, judges, searches, rechecks } = {}) {
  validateHeader(parsed, "Claims Register", problems);
  const table = validateTable(parsed, REGISTER_COLUMNS, problems);
  if (!table) return;
  const seen = new Set();
  for (const { line, cells } of table.rows) {
    const where = `line ${line}`;
    if (!/^C\d+$/.test(cells.ID)) problems.push(`${where}: ID must be C followed by a number`);
    else if (seen.has(cells.ID)) problems.push(`${where}: duplicate ID ${cells.ID}`);
    seen.add(cells.ID);
    for (const column of ["Claim", "Source", "Scope", "Limit"]) {
      if (cells[column] === "" || placeholder(cells[column])) problems.push(`${where}: ${column} must be filled`);
    }
    if (cells.Numbers === "") problems.push(`${where}: Numbers must list the claim's numbers, or "-" when it has none`);
    if (!LEVELS.includes(cells.Level)) problems.push(`${where}: Level must be one of: ${LEVELS.join(", ")}`);
    if (!KINDS.includes(cells.Kind)) problems.push(`${where}: Kind must be one of: ${KINDS.join(", ")}`);
    if (cells.Kind === "exploratory" && levelRank(cells.Level) > levelRank("L3")) {
      problems.push(
        `${where}: an exploratory claim is at most L3; ${cells.Level} needs a comparison whose decision rule was fixed beforehand`,
      );
    }
    if (plan && cells.Kind === "confirmatory") {
      const hypothesis = plan.hypotheses.get(cells.ID);
      if (!plan.locked)
        problems.push(
          `${where}: a confirmatory claim needs a locked study plan, and the plan is not locked (${plan.reason})`,
        );
      else if (!hypothesis || hypothesis.kind !== "confirmatory")
        problems.push(
          `${where}: ${cells.ID} is not a confirmatory hypothesis of the locked study plan, so it is exploratory`,
        );
      else if (plan.demoted?.has(cells.ID))
        problems.push(
          `${where}: an amendment changed ${cells.ID} after study runs existed, so it is exploratory now (at most L3)`,
        );
      else if (hypothesis.method && !hypothesis.method.startsWith("computed:") && plan.resultFile)
        problems.push(...methodProblems(where, cells, hypothesis.method, plan.resultFile));
    }
    // A model that judges or annotates what the analysis counts is a judge: a claim on the study's results cites its
    // validation record, or says no model's labels feed it.
    if (
      plan?.labelledByModel &&
      levelRank(cells.Level) > levelRank("L1") &&
      resultCitations(cells.Source ?? "").length > 0 &&
      !/\bjudge:\S/.test(cells.Source ?? "")
    )
      problems.push(
        `${where}: the plan lists a model that judges or annotates, so a claim on the study's results cites its judge record (judge:<record>), or judge:none when no model's labels feed it; without either it is at most L1`,
      );
    const cited = searchCitations(cells.Source ?? "");
    if (isAbsenceClaim(cells.Claim ?? "") && cited.length === 0)
      problems.push(
        `${where}: the claim is about absence (something new or never done), so cite the search behind it in Source as search:Q<n>`,
      );
    if (searches)
      for (const id of cited)
        if (!searches.has(id)) problems.push(`${where}: Source cites search:${id}, and the search ledger has no ${id}`);
    if (judges) {
      for (const path of judgeCitations(cells.Source)) {
        const record = judges.get(path);
        if (record?.counts) continue;
        if (levelRank(cells.Level) > levelRank("L1"))
          problems.push(
            `${where}: rests on the judge record ${path}, which ${record ? "does not pass" : "cannot be read"}, so the claim is at most L1; it is ${cells.Level}`,
          );
      }
    }
    // A source whose printed numbers cannot all be as printed (a recheck mismatch or decision error) caps the claims
    // resting on it at L1.
    // A claim that cites the recheck table itself states the recheck's finding, so it does not rest on the number.
    const citesRecheck = (cells.Source ?? "").split(/[;,\s]+/).includes(rechecks?.file);
    if (rechecks && !citesRecheck && levelRank(cells.Level) > levelRank("L1"))
      for (const id of new Set(sourceIds(cells.Source)))
        for (const row of rechecks.flags.get(id) ?? [])
          // A claim that cites the source for something else names the row in its Limit ("does not rest on N6").
          if (!new RegExp(`\\b${row.id}\\b`).test(cells.Limit ?? ""))
            problems.push(
              `${where}: ${id} has recheck row ${row.id} (${row.status}: ${row.where}), so a claim resting on it is at most L1; it is ${cells.Level}`,
            );
    if (!ledger) continue;
    for (const id of sourceIds(cells.Source)) {
      const source = ledger.get(id);
      if (!source) {
        problems.push(`${where}: Source names ${id}, which the source ledger does not have`);
        continue;
      }
      const cap = LEVEL_CAP[source.Checked];
      if (cap && levelRank(cells.Level) > levelRank(cap)) {
        problems.push(
          `${where}: ${id} was checked as "${source.Checked}", which caps a claim at ${cap}; this claim is ${cells.Level}`,
        );
      }
      if (source.Lookup === "refuted")
        problems.push(`${where}: ${id} is refuted in the source ledger and cannot support a claim`);
    }
  }
  if (plan?.variants) problems.push(...variantProblems(table.rows, plan.variants));
  // The source ledger's Supports lists the claims of this register that cite each source, so a reader can go either
  // way. A claim ID this register lacks is another register's (one ledger can serve a report and a paper), and is left.
  if (ledger) {
    const citing = new Map();
    for (const { cells } of table.rows)
      for (const id of new Set(sourceIds(cells.Source))) {
        if (!citing.has(id)) citing.set(id, new Set());
        citing.get(id).add(cells.ID);
      }
    for (const [id, source] of ledger) {
      const listed = new Set(source.Supports && source.Supports !== "-" ? source.Supports.split(/,\s*/) : []);
      const cited = citing.get(id) ?? new Set();
      const missing = [...cited].filter((claim) => !listed.has(claim));
      const extra = [...listed].filter((claim) => seen.has(claim) && !cited.has(claim));
      if (missing.length > 0 || extra.length > 0)
        problems.push(
          `the source ledger's Supports for ${id} ${[missing.length ? `lacks ${missing.join(", ")}, which cite it` : "", extra.length ? `lists ${extra.join(", ")}, which do not cite it` : ""].filter(Boolean).join(" and ")}`,
        );
    }
  }
}

const claimIds = (cell) => cell.match(/\bC\d+\b/g) ?? [];

/**
 * The verdict must come from the method the locked rule names: when the Method lists a test and the correction
 * applied to it, the verdict is the corrected one: every result file that holds the claim's numbers (every cited one,
 * when none does) records `computed_by` as a listed part, at least one of them as the last, and a receipt of the
 * locked study that ran stats.mjs wrote each as it is now. `resultFile(path)` gives `{ numbers, computedBy, receipt }` for a path
 * relative to the register, or null when it cannot be read.
 */
function methodProblems(where, cells, method, resultFile) {
  const parts = method.split(";").map((part) => `stats.mjs ${part.trim()}`);
  const verdict = parts.at(-1);
  const named = parts.length > 1 ? `${parts.join(", then ")} (the verdict is ${verdict})` : verdict;
  const files = resultCitations(cells.Source ?? "")
    .map((file) => ({ path: file.path, ...(resultFile(file.path) ?? { missing: true }) }))
    .filter((file) => !file.missing);
  const wanted = numbersIn(cells.Numbers ?? "");
  const carrying = files.filter((file) => wanted.some((number) => numberInResults(number, file.numbers)));
  const checked = carrying.length > 0 ? carrying : files;
  const problems = [];
  if (checked.length === 0)
    return [
      `${where}: the locked plan decides ${cells.ID} with ${named}, and Source cites no result file to check it against`,
    ];
  for (const file of checked) {
    if (file.computedBy.length === 0)
      problems.push(
        `${where}: ${file.path} records no computed_by, so the method behind ${cells.ID}'s verdict is unknown; compute it with stats.mjs`,
      );
    else if (file.computedBy.some((value) => !parts.includes(value)))
      problems.push(
        `${where}: the locked plan decides ${cells.ID} with ${named}, but ${file.path} was computed by ${[...new Set(file.computedBy)].join(", ")}`,
      );
    else if (file.receipt === null)
      problems.push(
        `${where}: no receipt of the locked study wrote ${file.path} as it is now by running stats.mjs; run it through study.mjs run after the lock (node stats.mjs <family> --input <file> --out ${file.path}), declaring the file as --output`,
      );
  }
  // The verdict itself (the correction, under a corrected rule) must be among the files that carry the numbers; the
  // uncorrected test may sit beside it, as when a register states both the raw and the adjusted p.
  if (problems.length === 0 && !checked.some((file) => file.computedBy.includes(verdict)))
    problems.push(
      `${where}: the locked plan decides ${cells.ID} with ${named}, but no cited result file holding its numbers was computed by ${verdict}`,
    );
  return problems;
}

/** Every analysis variant a plan lists must be reported: named in some row's Claim, Scope or Limit. */
function variantProblems(rows, variants) {
  // A variant is reported where a row names it as one ("under variant V2"); a bare "V2" may name something else.
  const named = new Set(
    rows.flatMap(({ cells }) =>
      [...[cells.Claim, cells.Scope, cells.Limit].join(" ").matchAll(/\bvariant\s+(V\d+)\b/gi)].map((match) =>
        match[1].toUpperCase(),
      ),
    ),
  );
  return [...new Set(variants.map((id) => id.toUpperCase()))]
    .filter((id) => !named.has(id))
    .map(
      (id) =>
        `${id}, an analysis variant of the plan, is reported by no claim; name it in a row as "variant ${id}", with its result or why it has none`,
    );
}

/** A section's table, checked against its columns; null with a problem when it is missing. */
function sectionTableChecked(parsed, name, columns, problems) {
  const lines = parsed.sections.get(name);
  if (!lines) {
    problems.push(`missing section "## ${name}"`);
    return null;
  }
  const parsedTable = parseTable(lines);
  if (!parsedTable) {
    problems.push(`## ${name} needs a table with columns: ${columns.join(", ")}`);
    return null;
  }
  const offset = parsed.starts?.get(name) ?? 0;
  const table = { ...parsedTable, rows: parsedTable.rows.map((row) => ({ ...row, line: row.line + offset })) };
  if (table.columns.join("|") !== columns.join("|"))
    problems.push(`## ${name}'s columns must be, in order: ${columns.join(", ")}`);
  return table;
}

/**
 * A paper outline: a proposition, refutable contributions each naming claims, one sentence per planned paragraph,
 * figures with their claims and data, and the objections answered. With `register` (the register's claim IDs) every
 * claim ID must exist there; with `dataExists` every figure's data file must exist. With `receipts` (the run
 * ledger's receipts by ID) and `figureFile` (a path's ledger-relative path and current sha256), a figure's receipt
 * must have exited 0, read its data file and written its figure file as they are now (and, with `specData`, its figure
 * spec must draw from that data file); a figure file that does not exist fails; `requireReceipts` also refuses
 * a figure with no receipt yet.
 */
function validateOutline(
  parsed,
  problems,
  { register, registerMissing, dataExists, receipts, figureFile, specData, requireReceipts = false } = {},
) {
  validateHeader(parsed, "Paper Outline", problems);
  headerPlaceholders(parsed, problems);
  if (!parsed.header.Register || placeholder(parsed.header.Register))
    problems.push("the header needs a Register: the claims register the paper draws on");
  else if (registerMissing)
    problems.push(`the header's Register, ${parsed.header.Register}, cannot be read, so the claim IDs are not checked`);
  // Before drafting, the proposition is the default, not a gate: "not yet stated" says so; review checks the draft.
  const proposition = (parsed.sections.get("Proposition") ?? []).join(" ").trim();
  if (!proposition || placeholder(proposition))
    problems.push('## Proposition must state the paper\'s one message, or say "not yet stated"');
  const known = (id, where) => {
    if (register && !register.has(id)) problems.push(`${where}: ${id} is not in the claims register`);
  };
  const contributions = sectionTableChecked(parsed, "Contributions", CONTRIBUTION_COLUMNS, problems);
  if (contributions && contributions.rows.length === 0) problems.push("## Contributions needs at least one row");
  for (const { line, cells } of contributions?.rows ?? []) {
    if (!/^K\d+$/.test(cells.ID)) problems.push(`line ${line}: a contribution's ID must be K followed by a number`);
    if (!cells.Contribution || placeholder(cells.Contribution))
      problems.push(`line ${line}: Contribution must be filled`);
    const ids = claimIds(cells.Claims);
    if (ids.length === 0) problems.push(`line ${line}: a contribution names at least one claim ID`);
    for (const id of ids) known(id, `line ${line}`);
  }
  const paragraphs = sectionTableChecked(parsed, "Paragraphs", PARAGRAPH_COLUMNS, problems);
  if (paragraphs && paragraphs.rows.length === 0) problems.push("## Paragraphs needs one row per planned paragraph");
  for (const { line, cells } of paragraphs?.rows ?? []) {
    for (const column of ["Section", "Paragraph", "Role"])
      if (!cells[column] || placeholder(cells[column])) problems.push(`line ${line}: ${column} must be filled`);
    if (cells.Claims !== "-" && claimIds(cells.Claims).length === 0)
      problems.push(`line ${line}: Claims lists claim IDs, or "-"`);
    for (const id of claimIds(cells.Claims)) known(id, `line ${line}`);
  }
  const figures =
    parsed.sections.has("Figures") && (parsed.sections.get("Figures") ?? []).join("").trim() === "none"
      ? null
      : sectionTableChecked(parsed, "Figures", FIGURE_COLUMNS, problems);
  for (const { line, cells } of figures?.rows ?? []) {
    const where = `line ${line}`;
    const isTable = /^T\d+$/.test(cells.ID);
    if (!/^[FT]\d+$/.test(cells.ID))
      problems.push(`${where}: a figure's ID is F followed by a number, a table's T followed by a number`);
    const ids = claimIds(cells.Claims);
    if (ids.length === 0) problems.push(`${where}: a figure names the claim IDs it shows`);
    for (const id of ids) known(id, where);
    if (!cells.Data || placeholder(cells.Data)) problems.push(`${where}: Data names the figure's data file`);
    else if (dataExists && !dataExists(cells.Data))
      problems.push(`${where}: the data file ${cells.Data} does not exist`);
    const file = cells.File && cells.File !== "-" && !placeholder(cells.File) ? cells.File : null;
    if (!file && !isTable) problems.push(`${where}: File names the figure's file`);
    const receipt = cells.Receipt;
    if (!receipt || placeholder(receipt) || (receipt !== "-" && !/^R\d+$/.test(receipt)))
      problems.push(`${where}: Receipt is the run that drew the figure (R<n>), or "-" until it is drawn`);
    else if (receipt === "-") {
      if (requireReceipts && !isTable)
        problems.push(`${where}: ${cells.ID} has no receipt, so its figure is not shown to come from its data`);
    } else if (!receipts) {
      problems.push(`${where}: ${receipt} cannot be checked: the header's Runs names no readable run ledger`);
    } else {
      const run = receipts.get(receipt);
      if (!run) problems.push(`${where}: ${receipt} is not in the run ledger`);
      else {
        if (run.exit_code !== 0) problems.push(`${where}: ${receipt} exited with ${run.exit_code}`);
        // A file that does not exist, or a receipt that recorded it as absent, matches nothing.
        const same = (recorded, now) =>
          now.sha256 !== null && recorded.path === now.path && recorded.sha256 === now.sha256;
        const data = figureFile?.(cells.Data);
        if (data && !run.inputs.some((input) => same(input, data)))
          problems.push(`${where}: ${receipt} did not read ${cells.Data} as it is now`);
        const specs = specData?.(run) ?? [];
        for (const spec of specs.filter((each) => !each.unchanged))
          problems.push(`${where}: ${receipt} did not read ${spec.spec} as it is now`);
        if (data && specs.length > 0 && !specs.some((each) => each.data === data.path))
          problems.push(
            `${where}: ${receipt}'s figure spec draws from ${specs.map((each) => each.data).join(", ")}, not ${cells.Data}`,
          );
        const drawn = file ? figureFile?.(file) : null;
        if (drawn && drawn.sha256 === null) problems.push(`${where}: the figure file ${file} does not exist`);
        else if (drawn && !run.outputs.some((output) => same(output, drawn)))
          problems.push(`${where}: ${receipt} did not write ${file} as it is now`);
      }
    }
  }
  const objections = parsed.sections.get("Objections");
  if (!objections) problems.push('missing section "## Objections" (a table, or "none found within these searches")');
  else if (!/none found within these searches/.test(objections.join(" "))) {
    const table = sectionTableChecked(parsed, "Objections", OBJECTION_COLUMNS, problems);
    for (const { line, cells } of table?.rows ?? [])
      if (
        !cells.Objection ||
        !cells["Answered in"] ||
        placeholder(cells.Objection) ||
        placeholder(cells["Answered in"])
      )
        problems.push(`line ${line}: each objection names where it is answered`);
  }
  const limits = (parsed.sections.get("Limits") ?? []).join(" ").trim();
  if (!limits || placeholder(limits)) problems.push("## Limits must say where the limits are stated");
}

/** A header field still holding the skeleton's placeholder. */
function headerPlaceholders(parsed, problems) {
  for (const [field, value] of Object.entries(parsed.header))
    if (placeholder(value)) problems.push(`the header's ${field} still holds a placeholder`);
}

/**
 * A rebuttal ledger: one row per reviewer comment with the author's choice, its reason, the commitment and where it is
 * fulfilled. At Stage submitted, every "will address" names where it was done. A comment in a later round either is
 * marked New ("yes": a request the earlier round did not make, the goalpost guard) or names the earlier comment it
 * continues ("continues R<n>").
 */
function validateRebuttal(parsed, problems) {
  validateHeader(parsed, "Rebuttal", problems);
  headerPlaceholders(parsed, problems);
  const stage = parsed.header.Stage;
  if (!REBUTTAL_STAGES.includes(stage))
    problems.push(`the header's Stage must be one of: ${REBUTTAL_STAGES.join(", ")}`);
  const table = validateTable(parsed, REBUTTAL_COLUMNS, problems);
  if (!table) return;
  const rows = new Map();
  for (const { line, cells } of table.rows) {
    const where = `line ${line}`;
    if (!/^R\d+$/.test(cells.ID)) problems.push(`${where}: ID must be R followed by a number`);
    else if (rows.has(cells.ID)) problems.push(`${where}: duplicate ID ${cells.ID}`);
    const round = Number(cells.Round);
    if (!Number.isInteger(round) || round < 1) problems.push(`${where}: Round must be a whole number of at least 1`);
    for (const column of ["Reviewer", "Comment", "Reason"])
      if (!cells[column] || placeholder(cells[column])) problems.push(`${where}: ${column} must be filled`);
    if (!CHOICES.includes(cells.Choice)) problems.push(`${where}: Choice must be one of: ${CHOICES.join(", ")}`);
    if (cells.Choice === "will address") {
      if (!cells.Commitment || cells.Commitment === "-" || placeholder(cells.Commitment))
        problems.push(`${where}: "will address" needs a commitment`);
      if (stage === "submitted" && (!cells.Fulfilled || cells.Fulfilled === "-" || placeholder(cells.Fulfilled)))
        problems.push(`${where}: the rebuttal is submitted, and this commitment does not say where it was fulfilled`);
    }
    rows.set(cells.ID, { round, reviewer: cells.Reviewer });
    if (round > 1) {
      const continues = /^continues (R\d+)$/.exec(cells.New);
      if (cells.New === "yes") continue;
      if (!continues)
        problems.push(
          `${where}: a round ${round} comment is New "yes", or "continues R<n>" naming the earlier comment`,
        );
      else {
        const earlier = rows.get(continues[1]);
        if (!earlier || earlier.round >= round || earlier.reviewer !== cells.Reviewer)
          problems.push(`${where}: ${continues[1]} is not an earlier-round comment by ${cells.Reviewer}`);
      }
    } else if (cells.New !== "-" && cells.New !== "") problems.push(`${where}: a round 1 comment's New is "-"`);
  }
}

/** The comments a rebuttal ledger marks as new requests in a later round: what the goalpost guard reports. */
export function newRequests(text) {
  const table = parseTable(parseMarkdown(text).lines);
  return (table?.rows ?? [])
    .filter((row) => Number(row.cells.Round) > 1 && row.cells.New === "yes")
    .map((row) => row.cells.ID);
}

// RoB 2 is built for randomized trials and ROBINS-I (or ROBINS-E) for studies that did not randomize; a tool named
// against the other kind of design, as the Design cell's leading words name it, is a slip. Only the words before the
// first ",", ";", "(" or " with " name the design, so "randomized trial with an observational follow-up" is a trial.
const designKind = (design) => (design ?? "").split(/[,;(]| with /i)[0];
const NOT_RANDOMIZED = /\bnon-?randomi[sz]ed\b|\bobservational\b|\bcohort\b|\bcase-control\b|\bcross-sectional\b/i;
const RANDOMIZED = /\brandomi[sz]ed\b|\bRCT\b/i;

/** An evidence table for a literature review: one row per study, with its level capped by how its source was checked. */
function validateEvidence(parsed, problems, { ledger } = {}) {
  validateHeader(parsed, "Evidence Table", problems);
  headerPlaceholders(parsed, problems);
  const found = parseTable(parsed.lines)?.columns ?? [];
  const columns =
    EVIDENCE_COLUMN_SETS.find((set) => set.join("|") === found.join("|")) ??
    (found.includes("Weakness") ? EVIDENCE_COLUMNS_WITH_WEAKNESS : EVIDENCE_COLUMNS);
  const table = validateTable(parsed, columns, problems);
  if (
    BIAS_COLUMNS.some((column) => found.includes(column)) &&
    !BIAS_COLUMNS.every((column) => columns.includes(column))
  )
    problems.push(
      `risk of bias takes both columns, "Bias tool" then "Risk of bias", after Level (and Weakness, when present)`,
    );
  for (const { line, cells } of table?.rows ?? []) {
    const where = `line ${line}`;
    if (columns.includes("Weakness") && (!cells.Weakness || placeholder(cells.Weakness)))
      problems.push(`${where}: Weakness must be filled: the study's main weakness, or "-" when none stands out`);
    if (!/^S\d+$/.test(cells.Source)) problems.push(`${where}: Source must be a source-ledger ID such as S3`);
    for (const column of ["Design", "Result", "Failure condition"])
      if (!cells[column] || placeholder(cells[column])) problems.push(`${where}: ${column} must be filled`);
    if (cells.n !== "-" && !/^[1-9]\d*$/.test(cells.n)) problems.push(`${where}: n must be a whole number, or "-"`);
    if (!LEVELS.includes(cells.Level)) problems.push(`${where}: Level must be one of: ${LEVELS.join(", ")}`);
    if (columns.includes("Risk of bias")) {
      const tool = cells["Bias tool"] ?? "";
      const risk = cells["Risk of bias"];
      if (!RISK_OF_BIAS.includes(risk))
        problems.push(`${where}: Risk of bias must be one of: ${RISK_OF_BIAS.join(", ")}`);
      if (tool === "" || placeholder(tool))
        problems.push(
          `${where}: Bias tool must name the tool that assessed it (RoB 2, ROBINS-I), or "-" when not assessed`,
        );
      else if (tool === "-" && RISK_OF_BIAS.includes(risk) && risk !== "not assessed")
        problems.push(`${where}: a risk of bias judged ${risk} names the tool that judged it`);
      else if (tool !== "-" && risk === "not assessed")
        problems.push(`${where}: Risk of bias is not assessed, so Bias tool is "-"`);
      else if (/\bRoB ?2\b/i.test(tool) && NOT_RANDOMIZED.test(designKind(cells.Design)))
        problems.push(`${where}: RoB 2 is for randomized trials, and the design reads "${cells.Design}"; use ROBINS-I`);
      else if (
        /\bROBINS-[IE]\b/i.test(tool) &&
        RANDOMIZED.test(designKind(cells.Design).replace(/\bnon-?randomi[sz]ed\b/gi, ""))
      )
        problems.push(
          `${where}: ${tool} is for studies that did not randomize, and the design reads "${cells.Design}"; use RoB 2`,
        );
    }
    const source = ledger?.get(cells.Source);
    if (ledger && !source) problems.push(`${where}: the source ledger has no ${cells.Source}`);
    // An abstract shows little of a study's weaknesses, so a weakness judged from one says where it came from.
    if (source?.Read === "abstract" && columns.includes("Weakness") && !/\(read: abstract\)/.test(cells.Weakness ?? ""))
      problems.push(
        `${where}: ${cells.Source} was read only at its abstract, so Weakness says so: "not assessed (read: abstract)", or the weakness the abstract shows, marked "(read: abstract)"`,
      );
    const cap = source && LEVEL_CAP[source.Checked];
    if (cap && levelRank(cells.Level) > levelRank(cap))
      problems.push(
        `${where}: ${cells.Source} was checked as "${source.Checked}", which caps it at ${cap}; it is ${cells.Level}`,
      );
  }
}

/**
 * A recheck table: one reported result per row, transcribed exactly. Its Status is the computation's
 * (`stats.mjs recheck --write`); a status that differs from what the reported text gives is refused.
 */
function validateRecheck(parsed, problems, { ledger } = {}) {
  validateHeader(parsed, "Recheck Table", problems);
  headerPlaceholders(parsed, problems);
  const table = validateTable(parsed, RECHECK_COLUMNS, problems);
  const seen = new Set();
  for (const { cells } of table?.rows ?? []) {
    const where = cells.ID || "a row";
    if (!/^N\d+$/.test(cells.ID)) problems.push(`${where}: ID must be N followed by a number`);
    else if (seen.has(cells.ID)) problems.push(`${where}: duplicate ID`);
    seen.add(cells.ID);
    if (!/^S\d+$/.test(cells.Source)) problems.push(`${where}: Source must be a source-ledger ID such as S3`);
    else if (ledger && !ledger.get(cells.Source)) problems.push(`${where}: the source ledger has no ${cells.Source}`);
    for (const column of ["Where", "Reported"])
      if (!cells[column] || placeholder(cells[column])) problems.push(`${where}: ${column} must be filled`);
    if (!CHECKS.includes(cells.Check)) {
      problems.push(`${where}: Check must be one of: ${CHECKS.join(", ")}`);
      continue;
    }
    if (!cells.Reported || placeholder(cells.Reported)) continue;
    const computed = statusCell(recheck(cells.Check, cells.Reported));
    if (!cells.Status || cells.Status === "-")
      problems.push(`${where}: Status is not computed yet; run stats.mjs recheck --write`);
    else if (cells.Status !== computed)
      problems.push(`${where}: Status says ${cells.Status}, but the computation gives ${computed}`);
  }
}

/**
 * The rows of a recheck table whose computation is a mismatch or a decision error, by source: each with its `id`,
 * its `status` and its `where`. The status is computed from the Reported text, not read from the Status cell.
 */
export function recheckFlags(text) {
  const flags = new Map();
  for (const { cells } of parseTable(parseMarkdown(text).lines)?.rows ?? []) {
    if (!CHECKS.includes(cells.Check) || !/^S\d+$/.test(cells.Source ?? "")) continue;
    const { status } = recheck(cells.Check, cells.Reported ?? "");
    if (status === "mismatch" || status === "decision error")
      flags.set(cells.Source, [...(flags.get(cells.Source) ?? []), { id: cells.ID, status, where: cells.Where }]);
  }
  return flags;
}

// The stages a hit is screened at. A criterion tagged full-text needs the full text to apply, so it cannot exclude a
// hit at the title-and-abstract stage; a title-abstract criterion applies at either stage.
export const SCREENING_STAGES = ["title-abstract", "full-text"];
const CITATION_DIRECTIONS = ["backward", "forward"];
const SCREEN_STATES = ["included", "excluded"];

/**
 * The files a search ledger's model screeners cite, read relative to the ledger at `path`: `judges` maps each judge
 * validation record to `judgeCounts` of it, and `rubrics` each rubric to its sha256; a file that cannot be read maps
 * to undefined.
 */
export function screenerFiles(path, text) {
  const judges = new Map();
  const rubrics = new Map();
  const file = (cited) => resolve(dirname(path), cited);
  for (const raw of text.split(/\r?\n/)) {
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      continue; // not JSON: validation reports it
    }
    if (record?.kind !== "screener" || typeof record.model !== "string") continue;
    if (typeof record.judge === "string" && !judges.has(record.judge))
      judges.set(
        record.judge,
        existsSync(file(record.judge)) ? judgeCounts(readFileSync(file(record.judge), "utf8")) : undefined,
      );
    if (typeof record.rubric === "string" && !rubrics.has(record.rubric))
      rubrics.set(
        record.rubric,
        existsSync(file(record.rubric))
          ? createHash("sha256")
              .update(readFileSync(file(record.rubric)))
              .digest("hex")
          : undefined,
      );
  }
  return { judges, rubrics };
}

const lineList = (lines) => (lines.length > 5 ? `${lines.slice(0, 5).join(", ")}, …` : lines.join(", "));

/**
 * Parse and check a search ledger: its queries, the screening criteria with their stage, the screeners (a person,
 * or a model with the rubric it was given and the judge validation record that lets its decisions count), and the
 * hits. `judges` and `rubrics` are as `screenerFiles` returns them; a file not in its map is treated as unread.
 */
function validateSearch(text, problems, { judges, rubrics } = {}) {
  const queries = new Set();
  const returned = new Map();
  const criteria = new Map();
  const screeners = new Map();
  const records = [];
  // The lines of the hits each model screener decided, so its record is checked once for all of them.
  const byModel = new Map();
  const usesScreener = (line, id, where) => {
    const screener = screeners.get(id);
    if (!screener) {
      problems.push(`line ${line}: ${where} names screener ${id}, which no earlier line defines`);
      return null;
    }
    if (screener.model) byModel.set(id, [...(byModel.get(id) ?? []), line]);
    return screener;
  };
  const checkCriterion = (line, record, criterion, state, where) => {
    const found = criteria.get(criterion);
    if (!found) {
      problems.push(`line ${line}: ${where} cites criterion ${criterion}, which no earlier line defines`);
      return;
    }
    if (state !== "excluded") problems.push(`line ${line}: ${where} cites a criterion, but only an exclusion has one`);
    if (!SCREENING_STAGES.includes(record.stage))
      problems.push(
        `line ${line}: ${where} cites criterion ${criterion}, so the hit needs the stage it was screened at`,
      );
    else if (found.stage === "full-text" && record.stage === "title-abstract")
      problems.push(
        `line ${line}: ${where} is excluded at title-abstract by ${criterion}, a full-text criterion, which the title and abstract cannot settle`,
      );
  };
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (raw.trim() === "") return;
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      problems.push(`line ${line}: not valid JSON`);
      return;
    }
    records.push({ line, record });
    if (record.kind === "query") {
      if (!/^Q\d+$/.test(record.id ?? "")) problems.push(`line ${line}: a query needs an id Q followed by a number`);
      else if (queries.has(record.id)) problems.push(`line ${line}: duplicate query id ${record.id}`);
      queries.add(record.id);
      // Citation chasing is its own method, as PRISMA counts it: from the sources it started at, in one direction,
      // in place of a database.
      if (record.method !== undefined && record.method !== "citation")
        problems.push(
          `line ${line}: a query's method, when given, is "citation"; a database search names its database`,
        );
      if (record.method === "citation") {
        if (record.database !== undefined)
          problems.push(`line ${line}: a citation query names from and direction instead of a database`);
        if (!Array.isArray(record.from) || record.from.length === 0 || !record.from.every((id) => /^S\d+$/.test(id)))
          problems.push(
            `line ${line}: a citation query needs from: the source-ledger IDs it started at, such as ["S2"]`,
          );
        if (!CITATION_DIRECTIONS.includes(record.direction))
          problems.push(`line ${line}: a citation query's direction is one of: ${CITATION_DIRECTIONS.join(", ")}`);
      }
      for (const field of record.method === "citation" ? ["date"] : ["query", "database", "date"])
        if (!record[field]) problems.push(`line ${line}: a query needs ${field}`);
      if (record.returned !== undefined && !(Number.isInteger(record.returned) && record.returned >= 0))
        problems.push(
          `line ${line}: returned is a whole number, copied from the service's own count of the records it returned`,
        );
      else if (record.returned !== undefined) returned.set(record.id, { line, returned: record.returned });
      if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date))
        problems.push(`line ${line}: date must be YYYY-MM-DD`);
      if ("hits" in record)
        problems.push(`line ${line}: do not type a hit count; counts are computed from the hit lines`);
    } else if (record.kind === "criterion") {
      if (!/^E\d+$/.test(record.id ?? ""))
        problems.push(`line ${line}: a criterion needs an id E followed by a number`);
      else if (criteria.has(record.id)) problems.push(`line ${line}: duplicate criterion id ${record.id}`);
      if (!record.text) problems.push(`line ${line}: a criterion needs its text`);
      if (!SCREENING_STAGES.includes(record.stage))
        problems.push(`line ${line}: a criterion's stage must be one of: ${SCREENING_STAGES.join(", ")}`);
      if (/^E\d+$/.test(record.id ?? "") && !criteria.has(record.id)) criteria.set(record.id, record);
    } else if (record.kind === "screener") {
      if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(record.id ?? ""))
        problems.push(`line ${line}: a screener needs an id of letters, digits and hyphens`);
      else if (screeners.has(record.id)) problems.push(`line ${line}: duplicate screener id ${record.id}`);
      const person = typeof record.person === "string" && record.person.trim() !== "";
      const model = typeof record.model === "string" && record.model.trim() !== "";
      // The reviewing agent itself: the author of the review, not a judge it delegated to, so it needs no judge
      // record; counts and the flow say which hits it screened alone, for the report's Limits.
      const agent = typeof record.agent === "string" && record.agent.trim() !== "";
      if ([person, model, agent].filter(Boolean).length !== 1)
        problems.push(
          `line ${line}: a screener names just one of: either a person or a model (a delegated judge), or agent (the reviewing agent itself, its model and version)`,
        );
      if (model && !(typeof record.judge === "string" && record.judge.trim() !== ""))
        problems.push(
          `line ${line}: a model screener needs judge: the path of the judge validation record that lets its decisions count`,
        );
      if (model && !(typeof record.rubric === "string" && record.rubric.trim() !== ""))
        problems.push(
          `line ${line}: a model screener needs rubric: the path of the screening instructions it was given, which hold the ledger's criteria`,
        );
      if (record.id && !screeners.has(record.id))
        screeners.set(record.id, {
          ...record,
          model: model && !person && !agent,
          agent: agent && !person && !model ? record.agent.trim() : false,
        });
    } else if (record.kind === "hit") {
      if (!queries.has(record.query))
        problems.push(`line ${line}: hit names query ${record.query}, which no earlier line defines`);
      if (!record.title) problems.push(`line ${line}: a hit needs a title`);
      if (!HIT_STATES.includes(record.state))
        problems.push(`line ${line}: state must be one of: ${HIT_STATES.join(", ")}`);
      if (record.state === "duplicate" && !record.reason) problems.push(`line ${line}: a duplicate hit needs a reason`);
      if (record.state === "excluded" && !record.reason && !record.criterion)
        problems.push(`line ${line}: an excluded hit needs a reason or the criterion it was excluded by`);
      if (record.source !== undefined && !/^S\d+$/.test(record.source))
        problems.push(`line ${line}: source must be a source-ledger ID such as S3`);
      if (record.stage !== undefined && !SCREENING_STAGES.includes(record.stage))
        problems.push(`line ${line}: stage must be one of: ${SCREENING_STAGES.join(", ")}`);
      if (record.criterion !== undefined) checkCriterion(line, record, record.criterion, record.state, "the hit");
      if (record.screener !== undefined) usesScreener(line, record.screener, "the hit");
      if (record.screens !== undefined) {
        const screens = record.screens;
        if (!Array.isArray(screens) || screens.length !== 2) {
          problems.push(`line ${line}: screens holds the two screeners' decisions, as an array of two`);
        } else {
          if (record.screener !== undefined)
            problems.push(`line ${line}: a hit with two screens names its screeners there, not in screener`);
          if (record.state === "duplicate")
            problems.push(`line ${line}: a duplicate is removed before screening, so it has no screens`);
          screens.forEach((screen, at) => {
            const where = `screen ${at + 1}`;
            if (!screen || typeof screen !== "object") {
              problems.push(`line ${line}: ${where} must be an object with screener and state`);
              return;
            }
            usesScreener(line, screen.screener, where);
            if (!SCREEN_STATES.includes(screen.state))
              problems.push(`line ${line}: ${where}'s state must be one of: ${SCREEN_STATES.join(", ")}`);
            if (screen.criterion !== undefined) checkCriterion(line, record, screen.criterion, screen.state, where);
          });
          if (screens[0]?.screener !== undefined && screens[0]?.screener === screens[1]?.screener)
            problems.push(`line ${line}: the two screens need two different screeners`);
          // The hit's own state is the decision that counts. Where the screeners disagree, or it departs from what
          // they both said (unscreened included), a person settles it and is named.
          const agreed = screens[0]?.state === screens[1]?.state ? screens[0]?.state : null;
          const settled = typeof record.settled_by === "string" && record.settled_by.trim() !== "";
          const departs = agreed ? record.state !== agreed : SCREEN_STATES.includes(record.state);
          if (departs && record.state !== "duplicate" && !settled)
            problems.push(
              `line ${line}: ${agreed ? `the screeners agreed the hit is ${agreed}, and its state is ${record.state}` : "the screeners disagree"}, so settled_by names the person who settled it`,
            );
          if (settled && screeners.get(record.settled_by)?.model)
            problems.push(
              `line ${line}: settled_by names ${record.settled_by}, a model; a person settles a disagreement`,
            );
        }
      }
    } else {
      problems.push(`line ${line}: kind must be "query", "criterion", "screener" or "hit"`);
    }
  });
  // Criteria fixed for the review are its only grounds for exclusion: once the ledger defines them, every excluded
  // hit cites the one that excluded it.
  if (criteria.size > 0)
    for (const { line, record } of records)
      if (record.kind === "hit" && record.state === "excluded" && record.criterion === undefined)
        problems.push(
          `line ${line}: the ledger defines criteria, so an excluded hit cites the criterion it was excluded by`,
        );
  // A query's returned count is the service's own; fewer than the hits logged under it is a count typed wrong.
  for (const [id, { line, returned: count }] of returned) {
    const hits = records.filter(({ record }) => record.kind === "hit" && record.query === id).length;
    if (count < hits)
      problems.push(
        `line ${line}: ${id} says the service returned ${count} records, and ${hits} hits are logged under it; copy returned from the service's own count`,
      );
  }
  // A model's decisions count only under a passing judge record for the rubric it was given: a record validated on
  // other instructions says nothing about these.
  for (const [id, lines] of byModel) {
    const screener = screeners.get(id);
    if (!screener.judge || !screener.rubric) continue;
    const record = judges?.get(screener.judge);
    const rubric = rubrics?.get(screener.rubric);
    let why = null;
    if (!record) why = `its judge record ${screener.judge} cannot be read`;
    else if (!record.counts)
      why = `its judge record ${screener.judge} does not pass (${record.problems.length > 0 ? record.problems.join("; ") : "its Result is not pass"})`;
    else if (rubric === undefined) why = `its rubric ${screener.rubric} cannot be read`;
    else if (record.rubricSha256 !== rubric)
      why = `its judge record ${screener.judge} was validated on a rubric with sha256 ${record.rubricSha256}, not on its rubric ${screener.rubric} (sha256 ${rubric})`;
    if (why)
      problems.push(
        `screener ${id} is a model, and ${why}, so the ${lines.length} hit${lines.length === 1 ? "" : "s"} it screened (line${lines.length === 1 ? "" : "s"} ${lineList(lines)}) do not count`,
      );
  }
  return { records, criteria, screeners };
}

/** The exclusions in `hits`, grouped by the criterion that excluded them (in the ledger's order), then by reason. */
function exclusionReasons(hits, criteria) {
  const groups = new Map();
  for (const id of criteria.keys()) groups.set(`criterion:${id}`, null);
  for (const hit of hits) {
    const key = hit.criterion !== undefined ? `criterion:${hit.criterion}` : `reason:${hit.reason ?? ""}`;
    const group = groups.get(key) ?? {
      ...(hit.criterion !== undefined ? { criterion: hit.criterion } : {}),
      reason:
        hit.criterion !== undefined ? (criteria.get(hit.criterion)?.text ?? hit.reason ?? "") : (hit.reason ?? ""),
      records: 0,
    };
    group.records += 1;
    groups.set(key, group);
  }
  return [...groups.values()].filter(Boolean);
}

const total = (reasons) => reasons.reduce((sum, reason) => sum + reason.records, 0);

/**
 * The review's flow from identification to inclusion, PRISMA-style, as data `figure.mjs` draws: the records each
 * database gave, and, when there are any, those found by other methods (citation chasing) and those a service
 * returned that no hit line logs (from a query's `returned`); the duplicates removed, those awaiting screening, those
 * screened, the exclusions at each stage with their reasons, and the studies included. The full-text step appears
 * only when some hit records the full-text stage; `agent_alone` only when the reviewing agent screened hits with no
 * second screener, so the report names it in its Limits.
 */
export function searchFlow(records, criteria, screeners = new Map()) {
  const databases = new Map();
  const otherMethods = new Map();
  const queryOf = new Map();
  for (const { record } of records) {
    if (record.kind === "query" && !queryOf.has(record.id)) queryOf.set(record.id, record);
  }
  const hits = records
    .map(({ record }) => record)
    .filter((record) => record.kind === "hit" && queryOf.has(record.query) && HIT_STATES.includes(record.state));
  const logged = new Map();
  for (const hit of hits) logged.set(hit.query, (logged.get(hit.query) ?? 0) + 1);
  // A query's records: those its service returned when the ledger copies that count, otherwise the hits it logs.
  let notScreened = 0;
  let anyReturned = false;
  for (const [id, query] of queryOf) {
    const hitsOf = logged.get(id) ?? 0;
    const returned = Number.isInteger(query.returned) && query.returned >= hitsOf ? query.returned : null;
    if (returned !== null) {
      anyReturned = true;
      notScreened += returned - hitsOf;
    }
    const records = returned ?? hitsOf;
    if (query.method === "citation") {
      if (records === 0) continue;
      const key = `citation, ${query.direction}`;
      otherMethods.set(key, (otherMethods.get(key) ?? 0) + records);
    } else if (records > 0) databases.set(query.database, (databases.get(query.database) ?? 0) + records);
  }
  const excluded = hits.filter((hit) => hit.state === "excluded");
  const atStage = (stage) => excluded.filter((hit) => hit.stage === stage);
  const titleAbstract = exclusionReasons(atStage("title-abstract"), criteria);
  const fullText = exclusionReasons(atStage("full-text"), criteria);
  const unstaged = exclusionReasons(
    excluded.filter((hit) => !SCREENING_STAGES.includes(hit.stage)),
    criteria,
  );
  const count = (state) => hits.filter((hit) => hit.state === state).length;
  const included = count("included");
  const fullTextStage = hits.some((hit) => hit.stage === "full-text");
  // Hits the reviewing agent screened with no second screener.
  const agents = new Set();
  let agentAlone = 0;
  for (const hit of hits) {
    const agent = screeners.get(hit.screener)?.agent;
    if (agent && SCREEN_STATES.includes(hit.state)) {
      agentAlone += 1;
      agents.add(agent);
    }
  }
  return {
    kind: "search-flow",
    computed_by: "artifact.mjs counts --flow",
    identified: {
      records: hits.length + notScreened,
      databases: [...databases].map(([database, n]) => ({ database, records: n })),
      ...(otherMethods.size > 0
        ? { other_methods: [...otherMethods].map(([method, n]) => ({ method, records: n })) }
        : {}),
    },
    ...(anyReturned ? { not_screened: notScreened } : {}),
    duplicates: count("duplicate"),
    awaiting: count("unscreened"),
    screened: included + excluded.length,
    ...(agentAlone > 0 ? { agent_alone: { records: agentAlone, agents: [...agents] } } : {}),
    excluded_title_abstract: { records: total(titleAbstract), reasons: titleAbstract },
    excluded_stage_not_recorded: { records: total(unstaged), reasons: unstaged },
    full_text: fullTextStage
      ? { assessed: included + total(fullText), excluded: { records: total(fullText), reasons: fullText } }
      : null,
    included,
  };
}

/**
 * Agreement between two screeners on the hits both screened, per pair of screeners and stage: raw agreement, Cohen's
 * kappa, and the disagreements, each of which a person settles (`unsettled` counts those still open).
 */
function screeningAgreement(records) {
  const groups = new Map();
  for (const { record } of records) {
    if (record.kind !== "hit" || !Array.isArray(record.screens) || record.screens.length !== 2) continue;
    const [first, second] = [...record.screens].sort((a, b) => String(a?.screener).localeCompare(String(b?.screener)));
    if (!SCREEN_STATES.includes(first?.state) || !SCREEN_STATES.includes(second?.state)) continue;
    const stage = SCREENING_STAGES.includes(record.stage) ? record.stage : "stage not recorded";
    const key = JSON.stringify([first.screener, second.screener, stage]);
    const group = groups.get(key) ?? { screeners: [first.screener, second.screener], stage, pairs: [], unsettled: 0 };
    group.pairs.push([first.state, second.state]);
    if (first.state !== second.state && !(typeof record.settled_by === "string" && record.settled_by.trim() !== ""))
      group.unsettled += 1;
    groups.set(key, group);
  }
  return [...groups.values()].map(({ screeners, stage, pairs, unsettled }) => {
    const kappa = cohenKappa(pairs);
    return {
      screeners,
      stage,
      items: kappa.items,
      observed: kappa.observed,
      kappa: kappa.kappa,
      disagreements: pairs.filter(([a, b]) => a !== b).length,
      unsettled,
    };
  });
}

/**
 * Hit counts per query and state, computed from a search ledger's hit lines; the agreement between two screeners
 * where hits carry both decisions; and the review's flow (`searchFlow`). `judges` and `rubrics` are as for validation.
 */
export function searchCounts(text, { judges, rubrics } = {}) {
  const problems = [];
  const { records, criteria, screeners } = validateSearch(text, problems, { judges, rubrics });
  const perQuery = new Map();
  const totals = Object.fromEntries(HIT_STATES.map((state) => [state, 0]));
  for (const { record } of records) {
    if (record.kind === "query")
      perQuery.set(record.id, {
        query: record.query,
        database: record.database,
        ...(record.method === "citation" ? { method: "citation", from: record.from, direction: record.direction } : {}),
        ...(record.returned !== undefined ? { returned: record.returned } : {}),
        date: record.date,
        ...Object.fromEntries(HIT_STATES.map((state) => [state, 0])),
      });
    if (record.kind === "hit" && perQuery.has(record.query) && HIT_STATES.includes(record.state)) {
      perQuery.get(record.query)[record.state] += 1;
      totals[record.state] += 1;
    }
  }
  const hits = Object.values(totals).reduce((sum, count) => sum + count, 0);
  return {
    queries: Object.fromEntries(perQuery),
    total: { hits, ...totals },
    agreement: screeningAgreement(records),
    flow: searchFlow(records, criteria, screeners),
    problems,
  };
}

/** The kind of an artifact, from its file name (`.jsonl`) or its header's Type. */
export function kindOf(path, text) {
  if (path.endsWith(".jsonl")) return "search-ledger";
  const type = parseMarkdown(text).header.Type;
  const found = Object.entries(KINDS_OF_ARTIFACT).find(([, value]) => value.type === type);
  return found ? found[0] : null;
}

/**
 * Validate one artifact. A claims register is cross-checked against what is given: its source ledger (every source ID
 * it cites exists, none is refuted, no level exceeds what its sources' checking allows), its study plan (each
 * confirmatory claim is a confirmatory hypothesis of a locked plan that no amendment changed after study runs:
 * `plan` is `{ hypotheses, locked, reason, demoted }`), and
 * its judge records (a claim resting on a judge record that does not pass is at most L1: `judges` maps each cited
 * path to `{ counts }`). A search ledger's model screeners are checked against `judges` and `rubrics`, as
 * `screenerFiles` reads them.
 */
export function validate(
  kind,
  text,
  {
    ledger,
    plan,
    judges,
    rubrics,
    searches,
    rechecks,
    register,
    registerMissing,
    dataExists,
    receipts,
    figureFile,
    specData,
    requireReceipts,
  } = {},
) {
  const problems = [];
  if (kind === "search-ledger") validateSearch(text, problems, { judges, rubrics });
  else {
    const parsed = parseMarkdown(text);
    if (kind === "research-brief") validateBrief(parsed, problems);
    else if (kind === "source-ledger") validateLedger(parsed, problems);
    else if (kind === "claims-register")
      validateRegister(parsed, problems, { ledger, plan, judges, searches, rechecks });
    else if (kind === "study-plan") validatePlan(parsed, problems);
    else if (kind === "judge-validation") validateJudge(parsed, problems);
    else if (kind === "paper-outline")
      validateOutline(parsed, problems, {
        register,
        registerMissing,
        dataExists,
        receipts,
        figureFile,
        specData,
        requireReceipts,
      });
    else if (kind === "rebuttal") validateRebuttal(parsed, problems);
    else if (kind === "evidence-table") validateEvidence(parsed, problems, { ledger });
    else if (kind === "recheck") validateRecheck(parsed, problems, { ledger });
    else problems.push(`unknown artifact kind "${kind}"`);
  }
  return { kind, valid: problems.length === 0, problems };
}
