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

/** Quotes attributed to a source: `"the exact words" (S3)`, with straight or curly double quotes. */
export function quoteCitations(text) {
  const plain = blankCode(text);
  const found = [];
  const pattern = /["“]([^"“”\n]+)["”]\s*\((S\d+)\)/g;
  for (const match of plain.matchAll(pattern)) {
    found.push({ line: lineOf(plain, match.index), source: match[2], quote: match[1], text: match[0] });
  }
  return found;
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
  /(?:section|sections|table|tables|figure|figures|fig\.|step|steps|version|versions|python|node|chapter|appendix|item|items|question|line|lines|rule|rules|phase|round|week|day|days)\s*$/i;

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

/** A number written for matching: thousands separators removed, a minus sign made plain, a trailing dot dropped. */
export function normalizeNumber(token) {
  return token
    .replace(/−/g, "-")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(/\.$/, "");
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
