// A paper's own checks and tools: the receipts behind its figures, the checks a draft must pass before review, the
// venue copy without claim IDs, and revision by patch. Nothing here calls a model or the network.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { blankCode, normalizeForQuote, numbersIn } from "./report.mjs";
import { fileHash, readLedger, receiptPath } from "./study.mjs";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/**
 * The outline options that check figures against their receipts: the receipts of the run ledger the outline's Runs
 * header names (relative to the outline), and each figure path's ledger-relative path and current sha256. A Runs of
 * "none", or none at all, gives no receipts, so a filled Receipt cell is reported as not checkable.
 */
export function figureReceipts(outlinePath, runs) {
  const folder = dirname(resolve(outlinePath));
  if (!runs || runs === "none") return {};
  const ledgerPath = resolve(folder, runs);
  if (!existsSync(ledgerPath)) return {};
  const ledgerFolder = dirname(ledgerPath);
  return {
    receipts: new Map(readLedger(ledgerPath).map((receipt) => [receipt.id, receipt])),
    figureFile: (path) => {
      const absolute = resolve(folder, path);
      return { path: receiptPath(ledgerFolder, absolute), sha256: fileHash(absolute) };
    },
    // The figure specs among the receipt's JSON inputs: the data file each names, in the receipt's own path form, and
    // whether the spec is still as the receipt read it.
    specData: (receipt) =>
      (receipt.inputs ?? []).flatMap((input) => {
        if (!input.path.endsWith(".json")) return [];
        const absolute = resolve(ledgerFolder, input.path);
        try {
          const spec = JSON.parse(readFileSync(absolute, "utf8"));
          if (typeof spec?.data !== "string" || !Array.isArray(spec.series)) return [];
          return [
            {
              spec: input.path,
              data: receiptPath(ledgerFolder, resolve(dirname(absolute), spec.data)),
              unchanged: input.sha256 !== null && input.sha256 === fileHash(absolute),
            },
          ];
        } catch {
          return [];
        }
      }),
  };
}

export { sha256 };

// ---------------------------------------------------------------------------------------------------------------
// Draft checks

/** The draft's headings and the lines under each, by its level-2 (or level-1 when there is no level-2) sections. */
export function sections(text) {
  const lines = withoutFrontMatter(blankCode(text)).split("\n");
  const found = [];
  let current = { name: null, level: 0, line: 1, lines: [] };
  lines.forEach((line, index) => {
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading && heading[1].length <= 2) {
      found.push(current);
      current = { name: heading[2], level: heading[1].length, line: index + 1, lines: [] };
    } else current.lines.push({ line: index + 1, text: heading ? "" : line });
  });
  found.push(current);
  return found.filter((section) => section.name !== null || section.lines.some((line) => line.text.trim() !== ""));
}

/** The text with a leading YAML front-matter block blanked, keeping its lines. */
function withoutFrontMatter(text) {
  const match = /^---\n[\s\S]*?\n(---|\.\.\.)\n/.exec(text);
  return match ? text.replace(match[0], match[0].replace(/[^\n]/g, " ")) : text;
}

// Sections a venue's word limit usually leaves out of the body count.
const NOT_BODY = /^(abstract|references|bibliography|acknowledg(e)?ments?)$/i;

const words = (text) => (text.match(/[^\s|#>*_`-][^\s|]*/g) ?? []).length;

/** Acronyms a draft uses: two or more capitals, not claim, source, figure or level IDs. */
const ACRONYM = /\b(?=[A-Z0-9]*[A-Z][A-Z0-9]*[A-Z])[A-Z][A-Z0-9]{1,}s?\b/g;
const ID_LIKE = /^(?:[A-Z]\d+|[A-Z]{1,2}-\d+)$/;

// A sentence that states what earlier work found or what is known, which needs a source.
const PRIOR_WORK =
  /\b(?:prior|previous|earlier|existing|recent) (?:work|studies|research|methods|approaches)\b|\b(?:studies|research|work|authors) (?:have |has )?(?:shown|found|reported|demonstrated)\b|\bit is (?:well[- ])?known\b|\bis widely (?:used|known|believed|accepted)\b/i;

// The run of words a passage must share with a source to count as copied.
const COPY_RUN = 12;

const copyWords = (text) =>
  normalizeForQuote(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/**
 * Runs of twelve or more words the draft shares with a saved source copy outside quotation marks and block quotes:
 * text taken from a source must be quoted and cited, or rewritten.
 */
export function copiedPassages(text, copies) {
  if (copies.size === 0) return [];
  const shingles = new Map();
  for (const [source, copy] of copies) {
    const sourceWords = copyWords(copy);
    for (let at = 0; at + COPY_RUN <= sourceWords.length; at++) {
      const key = sourceWords.slice(at, at + COPY_RUN).join(" ");
      if (!shingles.has(key)) shingles.set(key, source);
    }
  }
  // Read by paragraph, so a quotation that wraps across lines is still a quotation; block quotes are left out.
  const found = [];
  const lines = blankCode(text).split("\n");
  for (let start = 0; start < lines.length;) {
    if (lines[start].trim() === "") {
      start += 1;
      continue;
    }
    let end = start;
    while (end + 1 < lines.length && lines[end + 1].trim() !== "") end += 1;
    const paragraph = lines
      .slice(start, end + 1)
      .filter((line) => !/^\s*>/.test(line))
      .join(" ");
    const unquoted = paragraph.replace(/["“][^"“”]*["”]/g, " ");
    const paragraphWords = copyWords(unquoted);
    for (let at = 0; at + COPY_RUN <= paragraphWords.length; at++) {
      const key = paragraphWords.slice(at, at + COPY_RUN).join(" ");
      if (shingles.has(key)) {
        found.push({ line: start + 1, source: shingles.get(key), words: key });
        break;
      }
    }
    start = end + 1;
  }
  return found;
}

/** Words that usually belong to the work's own process, not to the paper; listed for the author, never removed. */
export const PROCESS_WORDS = [
  "TODO",
  "FIXME",
  "TBD",
  "XXX",
  "[citation needed]",
  "the agent",
  "coordinator",
  "receipt",
  "rerun",
  "round",
  "patch",
  "rebuttal",
];

/**
 * Check a draft before review. Problems (which fail the check): an abstract number missing from the body, a citation
 * `[@S<n>]` not in the source ledger, a "Figure N" or "Table N" the outline lacks or an outline figure the draft never
 * names, figures or tables numbered out of the order the text first names them, a "Section X" that names no heading,
 * and a section over its word limit ("total" counts the level-2 sections other than the abstract, references and
 * acknowledgements). Notes (listed, never failing): acronyms used before their definition or never defined, and
 * process words; `allow` silences an acronym or a process word that belongs to the paper.
 */
export function draftCheck(
  text,
  { ledger = null, figures = null, limits = new Map(), allow = new Set(), copies = new Map() } = {},
) {
  const problems = [];
  const notes = [];
  const parts = sections(text);
  if (!ledger) notes.push({ line: 1, kind: "not checked", value: "[@S<n>] citations (no source ledger given)" });
  if (!figures) notes.push({ line: 1, kind: "not checked", value: "figures against an outline (no outline given)" });
  const isAbstract = (section) => /^abstract$/i.test(section.name ?? "");
  const abstract = parts.find(isAbstract);
  const body = parts.filter((section) => section.level > 0 && !isAbstract(section) && section.level === 2);
  const bodySections = body.length > 0 ? body : parts.filter((section) => !isAbstract(section));

  // Abstract numbers appear in the body.
  if (abstract) {
    const bodyNumbers = new Set(
      bodySections.flatMap((section) => section.lines.flatMap((line) => numbersIn(line.text))),
    );
    for (const line of abstract.lines)
      for (const number of numbersIn(line.text))
        if (!bodyNumbers.has(number))
          problems.push({ line: line.line, kind: "abstract number not in the body", value: number });
  } else notes.push({ line: 1, kind: "no Abstract section", value: "abstract numbers not checked" });

  const plain = blankCode(text).split("\n");
  const headings = parts.filter((section) => section.name).map((section) => section.name.toLowerCase());
  const named = { F: new Set(), T: new Set() };
  plain.forEach((line, index) => {
    const at = index + 1;
    // Citations.
    for (const bracket of line.matchAll(/\[[^\]]*@S\d+[^\]]*\]/g))
      for (const cite of bracket[0].matchAll(/@(S\d+)\b/g))
        if (ledger && !ledger.has(cite[1]))
          problems.push({ line: at, kind: "citation not in the source ledger", value: cite[1] });
    // Figure and table references.
    for (const ref of line.matchAll(/\b(Figure|Fig\.|Table)\s+(\d+)\b/g)) {
      const id = `${ref[1] === "Table" ? "T" : "F"}${ref[2]}`;
      named[id[0]].add(id);
      if (figures && !figures.has(id))
        problems.push({ line: at, kind: "reference to a figure the outline lacks", value: ref[0] });
    }
    // Section references.
    if (!/^#/.test(line))
      for (const ref of line.matchAll(/\bSection\s+((?:\d+(?:\.\d+)*)|(?:[A-Z][\w-]*(?:\s+[A-Z][\w-]*)*))/g)) {
        const target = ref[1].toLowerCase();
        const found = headings.some(
          (heading) => heading === target || heading.startsWith(`${target} `) || heading.startsWith(`${target}.`),
        );
        if (!found) problems.push({ line: at, kind: "reference to a section the draft lacks", value: ref[0] });
      }
  });
  // Figures and tables are numbered in the order the text first names them.
  for (const kind of ["F", "T"]) {
    const order = [];
    plain.forEach((line) => {
      for (const ref of line.matchAll(/\b(Figure|Fig\.|Table)\s+(\d+)\b/g))
        if ((ref[1] === "Table" ? "T" : "F") === kind && !order.includes(Number(ref[2]))) order.push(Number(ref[2]));
    });
    order.forEach((number, index) => {
      if (index > 0 && number < order[index - 1])
        problems.push({
          line: 1,
          kind: "numbered out of order",
          value: `${kind === "T" ? "Table" : "Figure"} ${number} is first named after ${kind === "T" ? "Table" : "Figure"} ${order[index - 1]}`,
        });
    });
  }
  if (figures)
    for (const id of figures)
      if (!named[id[0]].has(id))
        problems.push({
          line: 1,
          kind: "outline figure the draft never names",
          value: `${id[0] === "T" ? "Table" : "Figure"} ${id.slice(1)}`,
        });

  // Word counts.
  const counts = {};
  let total = 0;
  for (const section of parts) {
    const count = section.lines.reduce((sum, line) => sum + words(line.text), 0);
    const name = section.name ?? "(before the first heading)";
    counts[name] = (counts[name] ?? 0) + count;
    if (section.level === 2 && !NOT_BODY.test(section.name)) total += count;
  }
  const hasBody = parts.some((section) => section.level === 2 && !NOT_BODY.test(section.name));
  // Body text under a level-1 heading other than the title would be left out of the total, so the total is not checked.
  const firstTitle = parts.findIndex((section) => section.level === 1);
  const mixed =
    hasBody &&
    parts.some(
      (section, index) =>
        section.level === 1 && index !== firstTitle && section.lines.some((line) => line.text.trim() !== ""),
    );
  for (const [name, limit] of limits) {
    if (name === "total" && (!hasBody || mixed)) {
      problems.push({
        line: 1,
        kind: "word limit not checked",
        value: mixed
          ? "total: body text sits under level-1 headings as well as level-2 ones"
          : "total: the draft has no level-2 body sections",
      });
      continue;
    }
    const value =
      name === "total" ? total : counts[Object.keys(counts).find((key) => key.toLowerCase() === name.toLowerCase())];
    if (value === undefined) problems.push({ line: 1, kind: "word limit for a section the draft lacks", value: name });
    else if (value > limit)
      problems.push({ line: 1, kind: "over its word limit", value: `${name}: ${value} words, limit ${limit}` });
  }

  // Acronyms: defined as "Long Form (ACR)" or "ACR (long form)" at or before first use.
  const firstUse = new Map();
  const definedAt = new Map();
  plain.forEach((line, index) => {
    if (/^#/.test(line)) return;
    for (const match of line.matchAll(ACRONYM)) {
      const acronym = match[0].replace(/s$/, "");
      if (ID_LIKE.test(acronym) || allow.has(acronym)) continue;
      if (!firstUse.has(acronym)) firstUse.set(acronym, index + 1);
      const before = line.slice(0, match.index);
      const after = line.slice(match.index + match[0].length);
      if ((/\(\s*$/.test(before) && /^\s*\)/.test(after) && /\w\s*\(\s*$/.test(before)) || /^\s*\([a-z]/i.test(after))
        if (!definedAt.has(acronym)) definedAt.set(acronym, index + 1);
    }
  });
  for (const [acronym, line] of firstUse) {
    if (!definedAt.has(acronym)) notes.push({ line, kind: "acronym never defined", value: acronym });
    else if (definedAt.get(acronym) > line)
      notes.push({
        line,
        kind: "acronym used before its definition",
        value: `${acronym} (defined at line ${definedAt.get(acronym)})`,
      });
  }

  // Ledger sources the draft never cites: read but unused, or cited under another form.
  if (ledger) {
    const cited = new Set([...plain.join("\n").matchAll(/@(S\d+)\b/g)].map((match) => match[1]));
    for (const id of ledger) if (!cited.has(id)) notes.push({ line: 1, kind: "ledger source never cited", value: id });
  }

  // Statements about prior work that cite no source.
  plain.forEach((line, index) => {
    if (/^#/.test(line)) return;
    for (const sentence of line.split(/(?<=[.!?])\s+/))
      if (PRIOR_WORK.test(sentence) && !/@S\d+|\bS\d+\b|\bC\d+\b/.test(sentence))
        notes.push({ line: index + 1, kind: "prior work without a citation", value: sentence.trim().slice(0, 80) });
  });

  // Passages copied from a saved source without quotation marks.
  for (const copied of copiedPassages(text, copies))
    problems.push({
      line: copied.line,
      kind: "copied without quotation marks",
      value: `${copied.source}: "${copied.words}"`,
    });

  // Process words.
  plain.forEach((line, index) => {
    for (const word of PROCESS_WORDS.filter((each) => !allow.has(each))) {
      const pattern = new RegExp(
        `(^|[^\\w])${word.replace(/[[\]]/g, "\\$&")}(?![\\w])`,
        word === word.toUpperCase() ? "" : "i",
      );
      if (pattern.test(line)) notes.push({ line: index + 1, kind: "process word", value: word });
    }
  });

  return { problems, notes, words: { sections: counts, total } };
}

// ---------------------------------------------------------------------------------------------------------------
// The venue copy

const ID_GROUP = /\s?\((?:\s*(?:C\d+|L[0-5])(?:\s*(?:,|;|and|to)\s*(?:C\d+|L[0-5]))*\s*)\)/g;

/**
 * The draft without its claim-ID parentheses, such as "(C1, C2)" or "(C3, L2)", for the venue. Claim IDs left in
 * running text (for example "C1 to C3 hold") are listed, not removed, so the author rewrites them.
 */
export function stripIds(text) {
  let removed = 0;
  const lines = text.split("\n");
  let inFence = false;
  const out = lines.map((line) => {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence || /^(```|~~~)/.test(line)) return line;
    return line.replace(ID_GROUP, () => {
      removed += 1;
      return "";
    });
  });
  const remaining = [];
  blankCode(out.join("\n"))
    .split("\n")
    .forEach((line, index) => {
      for (const match of line.matchAll(/\bC\d+\b/g)) remaining.push({ line: index + 1, id: match[0] });
    });
  return { text: out.join("\n"), removed, remaining };
}

// ---------------------------------------------------------------------------------------------------------------
// Revision by patch

/**
 * The draft's blocks: runs of non-blank lines, each top-level list item its own block (with its continuation lines),
 * and a fenced code block kept whole. Lines are 1-based.
 */
const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s/;

export function blocks(text) {
  const lines = text.split("\n");
  const found = [];
  let start = null;
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      if (line.startsWith(fence)) fence = null;
      continue;
    }
    if (/^(```|~~~)/.test(line)) {
      if (start === null) start = index;
      fence = line.slice(0, 3);
      continue;
    }
    if (line.trim() === "") {
      if (start !== null) found.push([start, index - 1]);
      start = null;
    } else if (start === null) start = index;
    else if (LIST_ITEM.test(line)) {
      found.push([start, index - 1]);
      start = index;
    }
  }
  if (start !== null) found.push([start, lines.length - 1]);
  return found.map(([from, to], at) => {
    const body = lines.slice(from, to + 1).join("\n");
    const block = { id: `B${at + 1}`, start: from + 1, end: to + 1, sha256: sha256(body), first: body.slice(0, 60) };
    return LIST_ITEM.test(lines[from]) ? { ...block, item: true } : block;
  });
}

/** The manifest of a reviewed draft: its hash and its blocks, so a patch can name exactly what it changes. */
export function anchor(text, draft) {
  return { draft, sha256: sha256(text), blocks: blocks(text) };
}

export const PATCH_OPS = ["replace", "delete", "insert-after"];

/**
 * Apply a patch to the reviewed draft. The patch names the anchored draft's sha256 as `base_sha256`. Each change names a
 * block of the manifest, the finding it answers, an op
 * (replace, delete, insert-after) and, except for delete, its text. The draft must be the one anchored; nothing
 * outside the named blocks changes. Returns the revised text and the apply report, or throws without changing anything.
 */
export function applyPatch(text, manifest, patch) {
  if (sha256(text) !== manifest.sha256)
    throw new Error("the draft changed since it was anchored; anchor the reviewed draft again");
  if (patch?.base_sha256 !== manifest.sha256)
    throw new Error(
      `the patch's base_sha256 must be the anchored draft's sha256 (${manifest.sha256.slice(0, 12)}...), so it applies only to the draft it was written for`,
    );
  const byId = new Map(manifest.blocks.map((block) => [block.id, block]));
  const changes = patch?.changes;
  if (!Array.isArray(changes) || changes.length === 0) throw new Error("the patch lists no changes");
  const seen = new Set();
  changes.forEach((change, index) => {
    const where = `change ${index + 1}`;
    if (!byId.has(change.block)) throw new Error(`${where}: ${change.block} is not a block of the anchored draft`);
    if (typeof change.finding !== "string" || change.finding.trim() === "")
      throw new Error(`${where}: name the finding it answers`);
    if (!PATCH_OPS.includes(change.op)) throw new Error(`${where}: op must be one of: ${PATCH_OPS.join(", ")}`);
    if (change.op !== "delete" && (typeof change.text !== "string" || change.text.trim() === ""))
      throw new Error(`${where}: ${change.op} needs its text`);
    const key = `${change.block}:${change.op === "insert-after" ? "insert" : "edit"}`;
    if (seen.has(key)) throw new Error(`${where}: ${change.block} is already changed by another change`);
    seen.add(key);
  });
  const lines = text.split("\n");
  const ordered = [...changes].sort(
    (a, b) => byId.get(b.block).start - byId.get(a.block).start || (a.op === "insert-after" ? -1 : 1),
  );
  for (const change of ordered) {
    const block = byId.get(change.block);
    const replacement = change.op === "delete" ? [] : change.text.replace(/\n+$/, "").split("\n");
    // After a list item, the new item follows directly, so the list stays one list.
    if (change.op === "insert-after") lines.splice(block.end, 0, ...(block.item ? [] : [""]), ...replacement);
    else if (change.op === "replace") lines.splice(block.start - 1, block.end - block.start + 1, ...replacement);
    else {
      const blankAfter = lines[block.end] !== undefined && lines[block.end].trim() === "" ? 1 : 0;
      lines.splice(block.start - 1, block.end - block.start + 1 + blankAfter);
    }
  }
  const revised = lines.join("\n");
  const report = {
    draft: manifest.draft,
    base_sha256: manifest.sha256,
    result_sha256: sha256(revised),
    changes: changes.map((change) => ({
      block: change.block,
      finding: change.finding,
      op: change.op,
      before_sha256: byId.get(change.block).sha256,
      after_sha256: change.op === "delete" ? null : sha256(change.text.replace(/\n+$/, "")),
    })),
    untouched_blocks:
      manifest.blocks.length - new Set(changes.filter((c) => c.op !== "insert-after").map((c) => c.block)).size,
  };
  return { text: revised, report };
}

// ---------------------------------------------------------------------------------------------------------------
// Bibliography

/** BibTeX entries in a .bib file: type, key and fields (values without their outer braces or quotes). */
export function parseBib(text) {
  const entries = [];
  const pattern = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let match;
  while ((match = pattern.exec(text))) {
    let depth = 1;
    let index = pattern.lastIndex;
    for (; index < text.length && depth > 0; index += 1) {
      if (text[index] === "{") depth += 1;
      else if (text[index] === "}") depth -= 1;
    }
    const body = text.slice(pattern.lastIndex, index - 1);
    const fields = {};
    const fieldPattern = /(\w+)\s*=\s*/g;
    let field;
    while ((field = fieldPattern.exec(body))) {
      let at = fieldPattern.lastIndex;
      let value = "";
      if (body[at] === "{") {
        let level = 0;
        const start = at;
        for (; at < body.length; at += 1) {
          if (body[at] === "{") level += 1;
          else if (body[at] === "}" && --level === 0) break;
        }
        value = body.slice(start + 1, at);
        at += 1;
      } else if (body[at] === '"') {
        const end = body.indexOf('"', at + 1);
        value = body.slice(at + 1, end);
        at = end + 1;
      } else {
        const end = body.slice(at).search(/[,\n]/);
        value = body.slice(at, end < 0 ? undefined : at + end).trim();
        at = end < 0 ? body.length : at + end;
      }
      fields[field[1].toLowerCase()] = value;
      fieldPattern.lastIndex = at;
    }
    entries.push({ type: match[1].toLowerCase(), key: match[2], fields });
    pattern.lastIndex = index;
  }
  return entries;
}

const bibValue = (value) => `{${String(value).replace(/[{}]/g, "")}}`;

/**
 * A .bib file from a source ledger, one entry per row keyed by its ID (S1, S2...). Fields come from the row's Pin:
 * doi, arXiv eprint, url and urldate, ISBN, or a repository at a commit. A row whose Lookup is not `verified` gets a
 * note saying so, and is listed. With `from` (entries of an existing .bib, such as a reference manager's export), an
 * entry with the same DOI or arXiv ID gives its type and fields; the key stays the ledger ID.
 */
export function bibFromLedger(rows, { from = [] } = {}) {
  const byDoi = new Map();
  const byArxiv = new Map();
  for (const entry of from) {
    if (entry.fields.doi) byDoi.set(entry.fields.doi.toLowerCase().replace(/^https?:\/\/doi\.org\//, ""), entry);
    if (entry.fields.eprint) byArxiv.set(entry.fields.eprint.toLowerCase().replace(/v\d+$/, ""), entry);
  }
  const out = [];
  const unverified = [];
  const matched = [];
  for (const [id, row] of rows) {
    const pin = (row.Pin ?? "").trim();
    const fields = {};
    let type = "misc";
    let doi = /^doi:\s*(\S+)/i.exec(pin)?.[1];
    if (!doi) doi = /doi\.org\/(\S+)/i.exec(pin)?.[1];
    const arxiv = /^arxiv:\s*(\S+)/i.exec(pin)?.[1];
    const url = /(https?:\/\/\S+?)(?:\s*\(accessed (\d{4}-\d{2}-\d{2})\))?$/.exec(pin);
    const isbn = /^ISBN\s*(\S+)/i.exec(pin)?.[1];
    const repository = /^([\w.-]+)@([0-9a-f]{7,40})$/.exec(pin);
    const known =
      (doi && byDoi.get(doi.toLowerCase())) || (arxiv && byArxiv.get(arxiv.toLowerCase().replace(/v\d+$/, "")));
    if (known) {
      type = known.type;
      Object.assign(fields, known.fields);
      matched.push(id);
    } else fields.title = row.Source;
    if (doi) fields.doi = doi;
    if (arxiv) Object.assign(fields, { eprint: arxiv, archiveprefix: "arXiv" });
    if (url && !doi) {
      fields.url = url[1];
      if (url[2]) fields.urldate = url[2];
    }
    if (isbn) fields.isbn = isbn;
    if (repository) fields.howpublished = `${repository[1]} at commit ${repository[2]}`;
    if (row.Lookup !== "verified") {
      fields.note = `unverified: lookup ${row.Lookup || "not recorded"}${row.Checked ? `, checked ${row.Checked}` : ""}`;
      unverified.push(id);
    }
    const lines = Object.entries(fields).map(([name, value]) => `  ${name} = ${bibValue(value)}`);
    out.push(`@${type}{${id},\n${lines.join(",\n")}\n}`);
  }
  return { text: `${out.join("\n\n")}\n`, unverified, matched };
}
