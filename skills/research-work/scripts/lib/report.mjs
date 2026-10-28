// Reading a research report for its checks: the citations it makes and the numbers it states. Code blocks, inline
// code and HTML comments are blanked first (keeping line numbers), so examples inside them are not taken as claims.

/** The text with fenced code blocks, inline code spans and HTML comments replaced by spaces; lines are kept. */
export function blankCode(text) {
  const blank = (match) => match.replace(/[^\n]/g, " ");
  return text
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, blank)
    .replace(/`[^`\n]*`/g, blank);
}

const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** Code citations `S<n>:path:line` or `S<n>:path:start-end`, read from the text including inline code. */
export function codeCitations(text) {
  const withoutBlocks = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (match) => match.replace(/[^\n]/g, " "));
  const found = [];
  const pattern = /\b(S\d+):([A-Za-z0-9_./@+-]+?):(\d+)(?:-(\d+))?(?![\w:/-]|\.\w)/g;
  for (const match of withoutBlocks.matchAll(pattern)) {
    found.push({
      line: lineOf(withoutBlocks, match.index),
      source: match[1],
      path: match[2],
      start: Number(match[3]),
      end: match[4] === undefined ? Number(match[3]) : Number(match[4]),
      text: match[0],
    });
  }
  return found;
}

// A quote followed by its source in parentheses: `(S3)`, `(S3:path)`, or the source first with more after it,
// such as the claim it supports: `(S3; C2, L3)`.
const QUOTE_CITATION = /["“]([^"“”\n]+)["”]\s*\((S\d+)(?::([A-Za-z0-9_./@+-]+))?(?:\s*[;,][^)\n]*)?\)/g;

/** Quotes attributed to a source: `"the exact words" (S3)`, with straight or curly double quotes. */
export function quoteCitations(text) {
  const plain = blankCode(text);
  const found = [];
  const pattern = new RegExp(QUOTE_CITATION.source, "g");
  for (const match of plain.matchAll(pattern)) {
    found.push({ line: lineOf(plain, match.index), source: match[2], path: match[3], quote: match[1], text: match[0] });
  }
  return found;
}

/**
 * Quoted passages of four or more words in a sentence that names a source (`S3`) but are not in a citation form,
 * such as `printed "the exact words" and exited (S2)`: a check that skipped them would pass what it never checked.
 */
export function looseQuotes(text) {
  const plain = blankCode(text);
  const cited = new Set(quoteCitations(text).map((citation) => `${citation.line}\u0000${citation.quote}`));
  const found = [];
  for (const match of plain.matchAll(/["“]([^"“”\n]+)["”]/g)) {
    if (match[1].trim().split(/\s+/).length < 4) continue;
    const line = lineOf(plain, match.index);
    if (cited.has(`${line}\u0000${match[1]}`)) continue;
    const start = Math.max(plain.lastIndexOf(". ", match.index), plain.lastIndexOf("\n", match.index), 0);
    const ends = [
      plain.indexOf(". ", match.index + match[0].length),
      plain.indexOf("\n", match.index + match[0].length),
    ].filter((at) => at >= 0);
    const sentence = plain.slice(start, ends.length ? Math.min(...ends) : plain.length);
    if (/\bS\d+\b/.test(sentence)) found.push({ line, quote: match[1], text: match[0] });
  }
  return found;
}

/** The text with each quote citation's quoted words blanked: digits inside a checked quote are not the report's numbers. */
export function blankQuoteCitations(text) {
  return text.replace(new RegExp(QUOTE_CITATION.source, "g"), (match) => {
    const close = match.search(/["”]\s*\(/);
    return match.slice(0, 1) + match.slice(1, close).replace(/[^\n]/g, " ") + match.slice(close);
  });
}

/** Text normalized for quote matching: curly quotes and dashes made plain, whitespace collapsed. */
export function normalizeForQuote(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Words after which a number is a label, not a measured quantity.
const LABEL_WORDS =
  /(?:section|sections|table|tables|figure|figures|fig\.|step|steps|version|versions|python|node|chapter|appendix|item|items|question|questions|finding|findings|note|notes|option|options|line|lines|rule|rules|phase|round|week|day|days)(?:\s+\d+(?:,\s*\d+)*(?:,|,?\s+and)?)?\s*$/i;

/**
 * The numbers a line states as quantities. Left out: dates, years 1900-2099 standing alone, version strings,
 * identifiers (arXiv, DOI, URLs, citations, claim and source IDs, levels), list numbering, and numbers after a
 * label word such as "Section" or "Table".
 */
export function numbersIn(line) {
  let text = line
    .replace(/\bhttps?:\/\/\S+/g, " ")
    .replace(/\b(?:arXiv|doi):\S+/gi, " ")
    .replace(/\bS\d+:[^\s]+/g, " ")
    .replace(/\b[SCQL]\d+\b/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")
    .replace(/\bv?\d+\.\d+\.\d+(?:[-+.\w]*)?/g, " ")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, (marker) => marker.replace(/\d/g, " "))
    .replace(/^#+\s*\d+(?:\.\d+)*\.?/, " ");
  const numbers = [];
  const pattern = /(?<![\w.])[-−]?\d[\d,]*(?:\.\d+)?%?(?![\w])/g;
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(0, match.index);
    if (LABEL_WORDS.test(before)) continue;
    const token = normalizeNumber(match[0]);
    if (/^(19|20)\d{2}$/.test(token)) continue;
    numbers.push(token);
  }
  return numbers;
}

/**
 * A number written for matching: thousands separators removed, a minus sign made plain, a trailing dot or comma
 * dropped, and the value written in its shortest form, so 0.9510 matches 0.951 and 1,200 matches 1200.
 */
export function normalizeNumber(token) {
  const plain = token
    .replace(/−/g, "-")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/[.,]$/, "");
  const percent = plain.endsWith("%");
  const value = Number(percent ? plain.slice(0, -1) : plain);
  return Number.isFinite(value) ? `${value}${percent ? "%" : ""}` : plain;
}

/**
 * The report split into units that carry their own citations: each table row, each list item, each heading, and
 * each run of other lines up to a blank line. A unit's numbers must be supported by the claims it cites.
 */
export function units(text) {
  const lines = blankCode(text).split("\n");
  const result = [];
  let current = null;
  const close = () => {
    if (current) result.push(current);
    current = null;
  };
  lines.forEach((content, index) => {
    const line = index + 1;
    if (content.trim() === "") return close();
    // The header's field lines (> **Status:** ...) describe the document, not its findings.
    if (/^>\s*\*\*[^*]+:\*\*/.test(content)) return close();
    const startsOwnUnit =
      /^\s*\|/.test(content) || /^\s*(?:[-*+]|\d+[.)])\s+/.test(content) || /^#/.test(content) || /^>/.test(content);
    if (startsOwnUnit || current === null) {
      close();
      current = { line, lines: [content] };
      if (/^\s*\|/.test(content) || /^#/.test(content) || /^>/.test(content)) close();
    } else current.lines.push(content);
  });
  close();
  return result.map((unit) => ({ line: unit.line, text: unit.lines.join("\n") }));
}

/** Claim IDs a unit cites. */
export function claimIds(text) {
  return [...new Set(text.match(/\bC\d+\b/g) ?? [])];
}

/**
 * The result files a register row's Source names: each `;`- or `,`-separated part that is a path (it holds a `/` or a
 * file extension), with an optional `:line` or `:start-end`. Source IDs and `judge:` records are not result files.
 */
export function resultCitations(source) {
  return source
    .split(/[;,]\s*/)
    .map((part) => part.trim())
    .filter((part) => part !== "" && !/^S\d+$/.test(part) && !part.startsWith("judge:"))
    .map((part) => /^(.+?)(?::(\d+)(?:-(\d+))?)?$/.exec(part))
    .filter((match) => match && (match[1].includes("/") || /\.\w+$/.test(match[1])))
    .map((match) => ({
      path: match[1],
      start: match[2] === undefined ? null : Number(match[2]),
      end: match[2] === undefined ? null : Number(match[3] ?? match[2]),
    }));
}

/** Every number written in a result file's text (JSON, CSV, logs), as numbers. */
export const fileNumbers = (text) =>
  [...text.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?(?![\w.]*\d)/g)].map((match) => Number(match[0]));

/**
 * The numbers a result file holds as values. A JSON file contributes only its numeric values, so a number written
 * inside a string (a rule's wording, a label) does not count as a result; any other file, or a cited line range,
 * contributes every number in its text.
 */
export function resultNumbers(text, path, { ranged = false } = {}) {
  if (!ranged && path.endsWith(".json")) {
    try {
      const values = [];
      const walk = (value) => {
        if (typeof value === "number") values.push(value);
        else if (value && typeof value === "object") Object.values(value).forEach(walk);
      };
      walk(JSON.parse(text));
      return values;
    } catch {
      // not JSON after all: read it as text
    }
  }
  return fileNumbers(text);
}

/**
 * Whether a register number is in a result file: some number there rounds to it at the register's precision. A
 * percentage matches either the same number or its fraction (65% matches 65 or 0.65).
 */
export function numberInResults(token, numbers) {
  const percent = token.endsWith("%");
  const written = token.replace(/%$/, "");
  const value = Number(written);
  if (!Number.isFinite(value)) return false;
  const decimals = written.includes(".") ? written.split(".")[1].length : 0;
  const tolerance = 0.5 * 10 ** -decimals + 1e-12;
  const matches = (candidate) => Math.abs(candidate - value) <= tolerance;
  return numbers.some((number) => matches(number) || (percent && matches(number * 100)));
}

/**
 * Percentages printed beside their counts that do not follow from them: "12 of 40 (35%)" is 30%. A percentage
 * matches when a/b rounds to it at the decimals printed.
 */
export function percentMismatches(line) {
  const found = [];
  const pattern =
    /(?<![\w.])(\d[\d,]*)\s*(?:of|out of|\/)\s*(\d[\d,]*)\s*(?:\(|,\s*|=\s*)\s*(\d+(?:\.\d+)?)\s*%\s*\)?/g;
  for (const match of line.matchAll(pattern)) {
    const [a, b] = [match[1], match[2]].map((value) => Number(value.replace(/,/g, "")));
    if (!(b > 0) || a > b) continue;
    const printed = match[3];
    const decimals = printed.includes(".") ? printed.split(".")[1].length : 0;
    const exact = (100 * a) / b;
    if (Math.abs(exact - Number(printed)) > 0.5 * 10 ** -decimals + 1e-9)
      found.push({ text: match[0].trim(), exact: Number(exact.toFixed(decimals + 1)) });
  }
  return found;
}

// Wording that says one thing made another better or caused it: it needs a controlled comparison (L4) behind it.
const STRONG =
  /\b(?:improv(?:e|es|ed|ing|ement|ements)|increas(?:e|es|ed)|rais(?:e|es|ed)|boost(?:s|ed)?|outperform(?:s|ed)?|beats?|better than|superior to|caus(?:e|es|ed)|leads? to|results? in)\b/gi;
// Wording that says a change was for the better, which a negative number contradicts.
const BETTER = /\b(?:improv(?:e|es|ed|ing|ement|ements)|gains?|boost(?:s|ed)?|better|outperform(?:s|ed)?)\b/i;

/** The strong words a text uses, lowercased. */
export const strongWords = (text) => [
  ...new Set((blankCode(text).match(STRONG) ?? []).map((word) => word.toLowerCase())),
];

/**
 * Wording the evidence may not support, listed for the author and never failing: comparative or causal wording on a
 * claim below L4, and wording of improvement in a sentence that states a negative number. `levels` maps claim IDs to
 * their levels (`L2`).
 */
export function wordingNotes(text, levels = new Map()) {
  const notes = [];
  const plain = blankCode(text);
  const ids = claimIds(plain).filter((id) => levels.has(id));
  const strong = strongWords(plain);
  if (strong.length > 0) {
    const low = ids.filter((id) => Number(String(levels.get(id)).slice(1)) < 4);
    if (low.length > 0)
      notes.push({
        kind: "wording above the level",
        value: `"${strong.join('", "')}" on ${low.map((id) => `${id} (${levels.get(id)})`).join(", ")}: comparative or causal wording needs L4`,
      });
  }
  for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
    if (!BETTER.test(sentence)) continue;
    const negative = numbersIn(sentence).find((number) => number.startsWith("-"));
    if (negative)
      notes.push({
        kind: "wording against the sign",
        value: `"${BETTER.exec(sentence)[0]}" beside ${negative}`,
      });
  }
  return notes;
}

// A claim about the newest or present state of something, which is true only at the moment it names.
const CURRENT =
  /\b(?:the\s+)?(?:latest|current|newest|most recent)\s+(?:version|release|model|commit|build|snapshot|api|docs|documentation|state|main branch)\b/i;
// What pins such a claim: a date, a version number, a commit, a pinned source citation, or "as of".
const ANCHOR = /\b\d{4}-\d{2}(?:-\d{2})?\b|\bv?\d+\.\d+(?:\.\d+)?\b|\b[0-9a-f]{7,40}\b|\bS\d+:|\bas of\b/i;

/** A "latest" or "current" claim in a unit that names no date, version or commit, which goes stale unseen. */
export function currentNotes(text) {
  const plain = blankCode(text);
  const match = CURRENT.exec(plain);
  return match && !ANCHOR.test(plain)
    ? [{ kind: "current without a date", value: `"${match[0].trim()}" names no date, version or commit` }]
    : [];
}
