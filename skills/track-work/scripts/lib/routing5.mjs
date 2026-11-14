// Delegation rules (SPEC-010 4.1): the rules the user owns, which `delegate open` reads for a worker's model and effort
// by the work's kind, whether its decisions are settled, and how its return is checked. The store's rules/delegation.md
// is read, a project's own projects/<project>/rules/delegation.md first; the older rules/routing.md (the project's, then
// the store's) is still read, so existing stores keep working. A file's machine-readable lines are optional: `Cheap:
// <model>`, `Worker: <model>` (the strongest model a worker may run on) and the routing table. `Cheap:` and `Worker:` are
// reserved for that shape: at the start of a line, followed by exactly one model ID; any other line is prose the parser
// ignores, and a file with no table has no table here. Each field is looked up on its own: the
// first file that has it wins, and a table row that matches nothing in the first table falls to the next. With no file
// for a field, Freeflow's shipped default gives it. The agent never edits these files.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The rules file in the store's rules/, and in a project's. */
export const RULES_FILE = join("rules", "delegation.md");
/** The older name for the rules file, still read after the newer one. */
export const ROUTING_FILE = join("rules", "routing.md");
/** The label the shipped default carries in a Route line, in place of a file's. */
export const DEFAULT_LABEL = "Freeflow's default";
export const COLUMNS = ["Kind", "Settled", "Check", "Tier", "Effort", "Ask first"];
export const ROUTE_KINDS = new Set(["build", "review", "research", "eval", "gather"]);
export const SETTLED = new Set(["yes", "no"]);
export const CHECKS = new Set(["scripted", "tests", "judgement"]);
export const TIERS = new Set(["frontier", "cheap"]);
/** Claude's model families, weakest first: a model in a family takes its rank; a model in none is not ranked. */
export const FAMILY_RANK = new Map([
  ["haiku", 1],
  ["sonnet", 2],
  ["opus", 3],
  ["fable", 4],
  ["mythos", 4],
]);

/** Freeflow's shipped default (SPEC-010 section 3, P1: two tiers, no Sonnet), used for any field no file gives. */
export const DEFAULT_RULES = `# Delegation rules

Cheap: claude-haiku-5-5
Worker: claude-opus-5-5

| Kind | Settled | Check | Tier | Effort | Ask first |
| --- | --- | --- | --- | --- | --- |
| gather, research, eval | any | any | cheap | xhigh | no |
| review | any | any | cheap | xhigh | no |
| review (security tier) | any | any | frontier | high | yes |
| build | yes | scripted, tests | cheap | xhigh | no |
| build | no | any | frontier | high | yes |
| any | any | judgement | frontier | high | yes |

Tiers: frontier = the Worker: model, the strongest a worker may run on (Opus on Claude); cheap = the Cheap: model, a model 4 to 10 times cheaper (Haiku on Claude).
`;

export class RoutingError extends Error {
  constructor(message, { label = null, line = null } = {}) {
    super(message);
    this.name = "RoutingError";
    this.label = label;
    this.line = line;
  }
}

const cellsOf = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

const listOf = (cell) =>
  cell
    .split(",")
    .map((each) => each.trim())
    .filter(Boolean);

/** A Kind cell's items: `any`, or kinds, each optionally for one tier, as `review (security tier)`. */
function kindsOf(cell, fail) {
  if (cell.toLowerCase() === "any") return "any";
  const items = listOf(cell).map((item) => {
    const match = /^([a-z]+)(?:\s+\(([a-z][a-z-]*) tier\))?$/.exec(item.toLowerCase());
    if (!match || !ROUTE_KINDS.has(match[1]))
      fail(
        `Kind "${item}" is not one of ${[...ROUTE_KINDS].join(", ")}, "<kind> (<name> tier)" or any; several are separated by commas`,
      );
    return { kind: match[1], tier: match[2] ?? null };
  });
  if (!items.length) fail("Kind is empty: name the kinds, or any");
  return items;
}

function oneOf(cell, allowed, column, fail, { several = false } = {}) {
  const value = cell.toLowerCase();
  if (value === "any") return "any";
  const items = several ? listOf(value) : [value];
  for (const item of items)
    if (!allowed.has(item))
      fail(
        `${column} "${cell}" is not ${[...allowed].join(", ")}${several ? ", several separated by commas," : ""} or any`,
      );
  if (!items.length) fail(`${column} is empty`);
  return items;
}

/** The machine-readable model lines: `Cheap: <model>` and `Worker: <model>`, each with exactly one model ID. */
const MODEL_LINES = [
  { key: "cheap", name: "Cheap", pattern: /^Cheap:\s*(\S+)$/ },
  { key: "worker", name: "Worker", pattern: /^Worker:\s*(\S+)$/ },
];

/**
 * A rules file's Cheap: and Worker: models, null where it has none, read from the file's lines alone, so a table that
 * does not parse does not hide them. `twice` names the first model line named twice, which parseRules refuses.
 */
export function modelLinesOf(text, label = RULES_FILE) {
  const lines = String(text ?? "").split(/\r?\n/);
  const found = { cheap: null, worker: null, twice: null };
  for (const [index, line] of lines.entries())
    for (const { key, name, pattern } of MODEL_LINES) {
      const match = pattern.exec(line.trim());
      if (!match) continue;
      if (found[key] !== null) found.twice ??= { label, line: index + 1, name, key };
      else found[key] = match[1];
    }
  return found;
}

/**
 * What one rules file gives: its Cheap: and Worker: models (null where it has none) and its table's rows in order, or
 * null when it has no table. Refuses, with the line and the reason, a model line named twice, a table header that is
 * not the six columns, a row that does not parse, and a table with no rows.
 */
export function parseRules(text, label = RULES_FILE) {
  const lines = String(text ?? "").split(/\r?\n/);
  const fail = (message, index) => {
    throw new RoutingError(index === undefined ? `${label}: ${message}` : `${label} line ${index + 1}: ${message}`, {
      label,
      line: index === undefined ? null : index + 1,
    });
  };
  const models = modelLinesOf(text, label);
  if (models.twice) fail(`the ${models.twice.key} model is named twice (${models.twice.name}:)`, models.twice.line - 1);
  const found = { label, cheap: models.cheap, worker: models.worker, rows: null };
  const same = (line) =>
    line.trim().startsWith("|") &&
    cellsOf(line)
      .map((cell) => cell.toLowerCase())
      .join("|") === COLUMNS.map((column) => column.toLowerCase()).join("|");
  const header = lines.findIndex(same);
  if (header === -1) {
    // A header that starts as the table's does but has other columns is a broken table, not prose.
    const broken = lines.findIndex((line) => line.trim().startsWith("|") && cellsOf(line)[0]?.toLowerCase() === "kind");
    if (broken !== -1)
      fail(`the table's header is ${cellsOf(lines[broken]).join(" | ")}, not ${COLUMNS.join(" | ")}`, broken);
    return found;
  }
  if (!/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[header + 1] ?? ""))
    fail("the header row is followed by its | --- | line", header + 1);
  const rows = [];
  for (let index = header + 2; index < lines.length && lines[index].trim().startsWith("|"); index += 1) {
    const at = (message) => fail(message, index);
    const cells = cellsOf(lines[index]);
    if (cells.length !== COLUMNS.length) at(`a row has ${COLUMNS.length} cells, not ${cells.length}`);
    const [kind, settled, check, tier, effort, ask] = cells;
    const tierName = tier.toLowerCase();
    if (!tier || /\s/.test(tier)) at(`Tier "${tier}" is frontier, cheap or one model ID, as claude-haiku-5-5`);
    if (!effort || /\s/.test(effort)) at(`Effort "${effort}" is one level, as xhigh`);
    if (!["yes", "no"].includes(ask.toLowerCase())) at(`Ask first "${ask}" is yes or no`);
    rows.push({
      label,
      line: index + 1,
      number: rows.length + 1,
      cells,
      kinds: kindsOf(kind, at),
      settled: oneOf(settled, SETTLED, "Settled", at),
      checks: oneOf(check, CHECKS, "Check", at, { several: true }),
      tier: TIERS.has(tierName) ? tierName : tier,
      effort,
      askFirst: ask.toLowerCase() === "yes",
    });
  }
  if (!rows.length) fail("the table has no rows", header);
  found.rows = rows;
  return found;
}

/**
 * The rules that apply to a task, nearest first, each that exists as { label, text }: the project's
 * projects/<project>/rules/delegation.md, the store's rules/delegation.md, the project's and the store's older
 * rules/routing.md, then Freeflow's shipped default, which is always last.
 */
export function rulesFiles(home, project = null) {
  const found = [];
  if (home) {
    const places = [
      project && { label: join("projects", project, RULES_FILE), path: join(home, "projects", project, RULES_FILE) },
      { label: RULES_FILE, path: join(home, RULES_FILE) },
      project && {
        label: join("projects", project, ROUTING_FILE),
        path: join(home, "projects", project, ROUTING_FILE),
      },
      { label: ROUTING_FILE, path: join(home, ROUTING_FILE) },
    ];
    for (const place of places.filter(Boolean))
      if (existsSync(place.path)) found.push({ label: place.label, text: readFileSync(place.path, "utf8") });
  }
  return [...found, { label: DEFAULT_LABEL, text: DEFAULT_RULES }];
}

/** Whether a row matches the work: its kind (and tier), settled and check; a value not given matches only any. */
function matches(row, { kind, tier, settled, check }) {
  const kindOk =
    row.kinds === "any" || row.kinds.some((item) => item.kind === kind && (item.tier ?? null) === (tier ?? null));
  const settledOk =
    row.settled === "any" || (settled !== null && settled !== undefined && row.settled.includes(settled));
  const checkOk = row.checks === "any" || (check !== null && check !== undefined && row.checks.includes(check));
  return kindOk && settledOk && checkOk;
}

/** The work as the route names it: `build, settled yes, check tests`, leaving out what was not given. */
export function inputsText({ kind, tier, settled, check }) {
  return [
    tier ? `${kind} (${tier} tier)` : kind,
    settled ? `settled ${settled}` : null,
    check ? `check ${check}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * The family a model is in: a family word among the parts of its ID (claude-opus-5-5, us.anthropic.claude-opus-5-5) or
 * the family word itself (Opus). Where an ID names two families, the higher-ranked one counts. Null when it is in none.
 */
export function familyOf(model) {
  const parts = String(model ?? "")
    .trim()
    .toLowerCase()
    .split(/[.\-/:\s_]+/);
  let found = null;
  for (const family of FAMILY_RANK.keys())
    if (parts.includes(family) && (found === null || FAMILY_RANK.get(family) > FAMILY_RANK.get(found))) found = family;
  return found;
}

/** A model's rank in the families, or null when it is not ranked. */
export function rankOf(model) {
  const family = familyOf(model);
  return family ? FAMILY_RANK.get(family) : null;
}

/**
 * The Worker: model: the first file's that names one, read even where the file's table does not parse (routeFrom
 * reports that), so a malformed file still caps the workers it names.
 */
export function workerFrom(files) {
  for (const file of files) {
    const { worker } = modelLinesOf(file.text, file.label);
    if (worker) return worker;
  }
  return null;
}

/** Whether a model is ranked above the Worker: model. A model in no family, or no Worker:, is never above it. */
export function ranksAbove(model, worker) {
  const rank = rankOf(model);
  const ceiling = rankOf(worker);
  return rank !== null && ceiling !== null && rank > ceiling;
}

/**
 * The route for one piece of work from the rules that apply (rulesFiles' order): the first matching row of the first
 * table that has one. `model` is the coordinator's model, for a frontier tier with no Worker: model; null when it is
 * not known. Returns { state: "malformed", error } when a file does not parse, { state: "unmatched", inputs, labels }
 * when no row matches, and { state: "matched", ... } with the row, the model and effort, whether the user must be asked
 * first, the brief's Route value and the Route line.
 */
export function routeFrom(files, work, model = null) {
  const parsed = [];
  for (const file of files) {
    try {
      parsed.push(parseRules(file.text, file.label));
    } catch (error) {
      if (error instanceof RoutingError) return { state: "malformed", error };
      throw error;
    }
  }
  const inputs = inputsText(work);
  const cheap = parsed.find((each) => each.cheap)?.cheap ?? null;
  const worker = parsed.find((each) => each.worker)?.worker ?? null;
  const frontier = worker ?? model;
  for (const table of parsed) {
    if (!table.rows) continue;
    const row = table.rows.find((each) => matches(each, work));
    if (!row) continue;
    const resolved = row.tier === "frontier" ? frontier : row.tier === "cheap" ? cheap : row.tier;
    const named =
      row.tier === "frontier"
        ? `frontier (${frontier ?? "the Worker: model"})`
        : row.tier === "cheap"
          ? `cheap (${cheap ?? "the cheap tier's model"})`
          : row.tier;
    // An Ask-first row names the tier, not the model, since the user says yes to the tier and effort (section 3).
    const line = row.askFirst
      ? `Route: ${named}, ${row.effort} — needs the user's yes (${row.label})`
      : `Route: ${named}, ${row.effort} (${row.label}: ${inputs})`;
    return {
      state: "matched",
      row,
      model: resolved ?? row.tier,
      resolved: Boolean(resolved),
      effort: row.effort,
      agent: `${resolved ?? row.tier}, ${row.effort}`,
      askFirst: row.askFirst,
      route: `${row.label} row ${row.number}`,
      label: row.label,
      named,
      line,
      inputs,
    };
  }
  return { state: "unmatched", inputs, labels: parsed.filter((each) => each.rows).map((each) => each.label) };
}

/**
 * The agreement's grants, from its latest `- Workers:` line or `- Update: Workers:` line (a later one replaces an
 * earlier one, so a narrowing update revokes a grant): each `;`- or `,`-separated item is a model ID or a family word,
 * optionally with `at <efforts>` (`Opus at medium or high`), which limits the grant to those efforts. The user's words
 * after the line's first sentence, a quote, and a date in brackets are not part of the grant. A bullet continued on
 * lines indented two spaces is read whole.
 */
export function grantsIn(lines) {
  let latest = -1;
  for (const [index, line] of lines.entries()) if (/^- (?:Update: )?Workers:/.test(line)) latest = index;
  if (latest === -1) return [];
  const grants = [];
  const match = /^- (?:Update: )?Workers:\s*(.*)$/.exec(lines[latest]);
  let whole = match[1];
  for (let next = latest + 1; next < lines.length && lines[next].startsWith("  "); next += 1)
    whole += ` ${lines[next].trim()}`;
  const text = whole
    .replace(/\([^)]*\)/g, " ")
    .replace(/"[^"]*"?.*$/, " ")
    .split(/\.(?:\s|$)/)[0];
  for (const piece of text.split(/[;,]/)) {
    const at = /^(.+?)\s+at\s+(.+)$/i.exec(piece.trim().replace(/\s+only$/i, ""));
    const name = (at ? at[1] : piece.trim().replace(/\s+only$/i, "")).trim().toLowerCase();
    if (!name) continue;
    const efforts = at
      ? at[2]
          .split(/\s*(?:\bor\b|\band\b|\/)\s*/i)
          .map((each) => each.trim().toLowerCase())
          .filter(Boolean)
      : null;
    grants.push({ name, efforts });
  }
  return grants;
}

/**
 * Whether one grant covers a route's model and effort: a family word covers its family, a full ID only itself. An item
 * with no `at` covers only the effort its route opens at, which is its row's; an item with `at` covers only the efforts
 * it lists.
 */
export function grantCovers(grant, model, effort) {
  const allowed = grant.efforts ?? [String(effort).toLowerCase()];
  if (!allowed.includes(String(effort).toLowerCase())) return false;
  if (FAMILY_RANK.has(grant.name)) return familyOf(model) === grant.name;
  return String(model).toLowerCase() === grant.name;
}
