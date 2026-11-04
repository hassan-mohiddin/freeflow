// Routing (SPEC-010 4.1): the table the user owns in the store's rules/routing.md, a project's own
// projects/<project>/rules/routing.md read first, from which `delegate open` takes a worker's model and effort by the
// work's kind, whether its decisions are settled, and how its return is checked. The first row that matches wins. The
// agent never edits the table; Setup Freeflow's store init writes the default one when it lays out a store (T2).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The table's place in the store's rules/, and in a project's. */
export const ROUTING_FILE = join("rules", "routing.md");
export const COLUMNS = ["Kind", "Settled", "Check", "Tier", "Effort", "Ask first"];
export const ROUTE_KINDS = new Set(["build", "review", "research", "eval", "gather"]);
export const SETTLED = new Set(["yes", "no"]);
export const CHECKS = new Set(["scripted", "tests", "judgement"]);
export const TIERS = new Set(["frontier", "cheap"]);

/** The table store init writes into a new store's rules/ (SPEC-010 section 3, P1: two tiers, no Sonnet). */
export const DEFAULT_TABLE = `# Routing

Cheap: claude-haiku-5-5

| Kind | Settled | Check | Tier | Effort | Ask first |
| --- | --- | --- | --- | --- | --- |
| gather, research, eval | any | any | cheap | xhigh | no |
| review | any | any | cheap | xhigh | no |
| review (security tier) | any | any | frontier | high | yes |
| build | yes | scripted, tests | cheap | xhigh | no |
| build | no | any | frontier | high | yes |
| any | any | judgement | frontier | high | yes |

Tiers: frontier = the coordinator's model; cheap = a model 4 to 10 times cheaper (Haiku on Claude).
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

/**
 * The table in one routing.md: its `Cheap:` model and its rows in order, each with the file line it is on. Refuses,
 * with the line and the reason, a file with no table of the six columns, a row that does not parse, and a table with
 * no rows.
 */
export function parseTable(text, label = ROUTING_FILE) {
  const lines = String(text ?? "").split(/\r?\n/);
  const fail = (message, index) => {
    throw new RoutingError(index === undefined ? `${label}: ${message}` : `${label} line ${index + 1}: ${message}`, {
      label,
      line: index === undefined ? null : index + 1,
    });
  };
  let cheap = null;
  for (const [index, line] of lines.entries()) {
    const match = /^Cheap:\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    if (cheap !== null) fail("the cheap model is named twice (Cheap:)", index);
    if (!/^\S+$/.test(match[1].trim())) fail("Cheap: names one model ID, as Cheap: claude-haiku-5-5", index);
    cheap = match[1].trim();
  }
  const header = lines.findIndex(
    (line) =>
      line.trim().startsWith("|") &&
      cellsOf(line)
        .map((cell) => cell.toLowerCase())
        .join("|") === COLUMNS.map((column) => column.toLowerCase()).join("|"),
  );
  if (header === -1) fail(`no table with the columns ${COLUMNS.join(" | ")}`);
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
  return { label, cheap, rows };
}

/**
 * The routing tables that apply to a task, nearest first: its project's projects/<project>/rules/routing.md, then
 * the store's rules/routing.md, each that exists, as { label, path, text }.
 */
export function routingFiles(home, project = null) {
  if (!home) return [];
  const places = [
    project && { label: join("projects", project, ROUTING_FILE), path: join(home, "projects", project, ROUTING_FILE) },
    { label: ROUTING_FILE, path: join(home, ROUTING_FILE) },
  ].filter(Boolean);
  return places
    .filter((place) => existsSync(place.path))
    .map((place) => ({ ...place, text: readFileSync(place.path, "utf8") }));
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
 * The route for one piece of work from the tables that apply (routingFiles' order): the first matching row of the
 * project's table, then of the store's. `model` is the coordinator's model, for the frontier tier; null when it is not
 * known. Returns { state: "none" } with no table, { state: "malformed", error } when a table does not parse,
 * { state: "unmatched", inputs, labels } when no row matches, and { state: "matched", ... } with the row, the agent
 * ("<model>, <effort>"), whether the user must be asked first, the brief's Route value and the Route line.
 */
export function routeFrom(files, work, model = null) {
  if (!files.length) return { state: "none" };
  const tables = [];
  for (const file of files) {
    try {
      tables.push(parseTable(file.text, file.label));
    } catch (error) {
      if (error instanceof RoutingError) return { state: "malformed", error };
      throw error;
    }
  }
  const inputs = inputsText(work);
  for (const table of tables) {
    const row = table.rows.find((each) => matches(each, work));
    if (!row) continue;
    // The cheap model is the table's own Cheap: line, else the store's; a tier with no model stays its family (section 5).
    const cheap = table.cheap ?? tables.find((each) => each.cheap)?.cheap ?? null;
    const resolved = row.tier === "frontier" ? model : row.tier === "cheap" ? cheap : row.tier;
    const named =
      row.tier === "frontier"
        ? `frontier (${model ?? "the coordinator's model"})`
        : row.tier === "cheap"
          ? `cheap (${cheap ?? "the cheap tier's model"})`
          : row.tier;
    // An Ask-first row names the tier, not the model, since the user says yes to the tier and effort (section 3).
    const asked = row.tier === "frontier" ? "frontier (the coordinator's model)" : named;
    const line = row.askFirst
      ? `Route: ${asked}, ${row.effort} — needs the user's yes (${row.label})`
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
      line,
      inputs,
    };
  }
  return { state: "unmatched", inputs, labels: tables.map((table) => table.label) };
}
