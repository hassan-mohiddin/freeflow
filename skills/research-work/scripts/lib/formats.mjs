// Research Work's artifact formats: what each file holds, a skeleton to start one, and a validator that refuses a
// file breaking its contract. The contract itself is written for agents in references/artifacts.md; this module is
// its enforcement. Markdown artifacts carry Write Docs' header (Type, Status, Owner, Source); the search ledger is
// JSONL, one record per line.

export const STATUSES = ["Draft", "Reviewed", "Accepted", "Rejected", "Superseded", "Retired"];
export const RIGOR = ["check", "study", "publication"];
export const LOOKUP = ["verified", "unresolved", "refuted", "not-looked-up"];
export const CHECKED = ["opened", "repository-read", "ran", "abstract", "summary-only", "memory"];
export const READ = ["full", "partial", "abstract", "none"];
export const LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5"];
export const KINDS = ["confirmatory", "exploratory"];
export const HIT_STATES = ["included", "excluded", "duplicate", "unscreened"];

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

export const KINDS_OF_ARTIFACT = {
  "research-brief": { type: "Research Brief", file: "brief.md" },
  "source-ledger": { type: "Source Ledger", file: "sources.md" },
  "search-ledger": { type: null, file: "search.jsonl" },
  "claims-register": { type: "Claims Register", file: "claims.md" },
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
  if (kind === "research-brief") {
    if (!RIGOR.includes(rigor)) throw new Error(`rigor must be one of: ${RIGOR.join(", ")}`);
    header.push(`> **Rigor:** ${rigor}`);
  }
  const lines = [...header, ""];
  if (kind === "research-brief") {
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
  let current = null;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      sections.set(current, []);
    } else if (current !== null) sections.get(current).push(line);
  }
  return { title, header, sections, lines };
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

const placeholder = (text) => /<[^>]+>/.test(text);

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

function validateRegister(parsed, problems, { ledger } = {}) {
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
    if (!ledger) continue;
    for (const id of cells.Source.match(/\bS\d+\b/g) ?? []) {
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
}

/** One parsed line of a search ledger, or a problem with it. */
function validateSearch(text, problems) {
  const queries = new Set();
  const records = [];
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
      for (const field of ["query", "database", "date"])
        if (!record[field]) problems.push(`line ${line}: a query needs ${field}`);
      if (record.date && !/^\d{4}-\d{2}-\d{2}$/.test(record.date))
        problems.push(`line ${line}: date must be YYYY-MM-DD`);
      if ("hits" in record)
        problems.push(`line ${line}: do not type a hit count; counts are computed from the hit lines`);
    } else if (record.kind === "hit") {
      if (!queries.has(record.query))
        problems.push(`line ${line}: hit names query ${record.query}, which no earlier line defines`);
      if (!record.title) problems.push(`line ${line}: a hit needs a title`);
      if (!HIT_STATES.includes(record.state))
        problems.push(`line ${line}: state must be one of: ${HIT_STATES.join(", ")}`);
      if (["excluded", "duplicate"].includes(record.state) && !record.reason)
        problems.push(`line ${line}: an ${record.state} hit needs a reason`);
      if (record.source !== undefined && !/^S\d+$/.test(record.source))
        problems.push(`line ${line}: source must be a source-ledger ID such as S3`);
    } else {
      problems.push(`line ${line}: kind must be "query" or "hit"`);
    }
  });
  return records;
}

/** Hit counts per query and state, computed from a search ledger's hit lines. */
export function searchCounts(text) {
  const problems = [];
  const records = validateSearch(text, problems);
  const perQuery = new Map();
  const total = Object.fromEntries(HIT_STATES.map((state) => [state, 0]));
  for (const { record } of records) {
    if (record.kind === "query")
      perQuery.set(record.id, {
        query: record.query,
        database: record.database,
        date: record.date,
        ...Object.fromEntries(HIT_STATES.map((state) => [state, 0])),
      });
    if (record.kind === "hit" && perQuery.has(record.query) && HIT_STATES.includes(record.state)) {
      perQuery.get(record.query)[record.state] += 1;
      total[record.state] += 1;
    }
  }
  const hits = Object.values(total).reduce((sum, count) => sum + count, 0);
  return { queries: Object.fromEntries(perQuery), total: { hits, ...total }, problems };
}

/** The kind of an artifact, from its file name (`.jsonl`) or its header's Type. */
export function kindOf(path, text) {
  if (path.endsWith(".jsonl")) return "search-ledger";
  const type = parseMarkdown(text).header.Type;
  const found = Object.entries(KINDS_OF_ARTIFACT).find(([, value]) => value.type === type);
  return found ? found[0] : null;
}

/**
 * Validate one artifact. A claims register is cross-checked against its source ledger when one is given: every
 * source ID it cites exists, none is refuted, and no claim's level exceeds what its sources' checking allows.
 */
export function validate(kind, text, { ledger } = {}) {
  const problems = [];
  if (kind === "search-ledger") validateSearch(text, problems);
  else {
    const parsed = parseMarkdown(text);
    if (kind === "research-brief") validateBrief(parsed, problems);
    else if (kind === "source-ledger") validateLedger(parsed, problems);
    else if (kind === "claims-register") validateRegister(parsed, problems, { ledger });
    else problems.push(`unknown artifact kind "${kind}"`);
  }
  return { kind, valid: problems.length === 0, problems };
}
