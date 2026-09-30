// Messages Freeflow gives around Pi's edit and write. Every error ends in one literal next action; results carry no
// reassurance. The wording was reviewed against the Beyond the Weights findings (Task 006 evidence).
const MAX_SHOWN_LINES = 20;
const MAX_LINE_CHARS = 300;
const MIN_SIMILARITY = 0.5;
/** Pi's edit fuzzy normalization (core/tools/edit-diff.ts normalizeForFuzzyMatch, not exported). */
export function normalizeForMatch(text) {
  return text
    .normalize("NFKC")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[  -   　]/g, " ");
}
/** File text as Pi's edit matches it: without a BOM and with LF line endings. */
export function editableText(raw) {
  return raw.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function bigrams(text) {
  const counts = new Map();
  for (let i = 0; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}
function lineSimilarity(a, b) {
  const x = a.trim(),
    y = b.trim();
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const left = bigrams(x),
    right = bigrams(y);
  let shared = 0;
  for (const [pair, count] of left) shared += Math.min(count, right.get(pair) ?? 0);
  return (2 * shared) / (x.length - 1 + (y.length - 1));
}
/** The window of the file most similar to the old text, as 1-based inclusive lines, or undefined when none is close. */
export function closestMatch(fileText, oldText) {
  const lines = fileText.split("\n");
  const wanted = oldText.replace(/\n+$/, "").split("\n");
  const size = Math.min(wanted.length, lines.length);
  if (size === 0) return undefined;
  let best;
  for (let start = 0; start + size <= lines.length; start++) {
    let total = 0;
    for (let i = 0; i < size; i++) total += lineSimilarity(lines[start + i], wanted[i]);
    const score = total / wanted.length;
    if (!best || score > best.score) best = { start, score };
  }
  return best && best.score >= MIN_SIMILARITY ? { start: best.start + 1, end: best.start + size } : undefined;
}
/** 1-based start lines of every place the old text matches, compared as Pi's edit compares it. */
export function matchingLines(fileText, oldText) {
  const haystack = normalizeForMatch(fileText),
    needle = normalizeForMatch(oldText);
  const found = [];
  if (!needle) return found;
  for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + 1))
    found.push(haystack.slice(0, index).split("\n").length);
  return found;
}
function shownLines(fileText, start, end) {
  return fileText
    .split("\n")
    .slice(start - 1, Math.min(end, start - 1 + MAX_SHOWN_LINES))
    .map((line) => (line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line))
    .join("\n");
}
const NOT_FOUND = /^Could not find (?:the exact text|edits\[(\d+)\]) in (.+?)\. The old ?[tT]ext must match exactly/;
const NOT_UNIQUE = /^Found (\d+) occurrences of (?:the text|edits\[(\d+)\]) in (.+?)\. /;
/**
 * Replace Pi's not-found or not-unique edit error with one literal next action. Returns undefined when the error is
 * another kind (overlap, empty, no change) or Pi worded it differently, so the result stays exactly as Pi wrote it.
 */
export function rewriteEditError(error, path, edits, fileText) {
  const notFound = NOT_FOUND.exec(error);
  if (notFound) {
    const index = notFound[1] === undefined ? 0 : Number(notFound[1]);
    const subject = notFound[1] === undefined ? path : `${path} edits[${index}]`;
    const oldText = editableText(String(edits[index]?.oldText ?? ""));
    const match = closestMatch(fileText, oldText);
    if (!match)
      return `${subject}: old text not found and no similar lines exist in the current file. Read the region you meant, then retry.`;
    return [
      `${subject}: old text not found. Closest match, lines ${match.start}–${match.end} (current file contents):`,
      shownLines(fileText, match.start, match.end),
      "If these are the lines you meant, retry with old text copied exactly from them. If not, read the region you meant, then retry.",
    ].join("\n");
  }
  const notUnique = NOT_UNIQUE.exec(error);
  if (notUnique) {
    const index = notUnique[2] === undefined ? 0 : Number(notUnique[2]);
    const subject = notUnique[2] === undefined ? path : `${path} edits[${index}]`;
    const lines = matchingLines(fileText, editableText(String(edits[index]?.oldText ?? "")));
    const places = lines.length > 0 ? lines.length : Number(notUnique[1]);
    const where = lines.length > 0 ? ` (lines ${lines.join(", ")})` : "";
    return `${subject}: old text matches ${places} places${where}. To change one place, add surrounding lines until it matches only that place. To change every place, give one edits[] entry per place, each with enough surrounding lines to match only that place.`;
  }
  return undefined;
}
export const writeRefusal = (path) =>
  `${path} exists and has not been read in this session. Read ${path}, then retry the write.`;
export const changedAfterEdit = (path) => `${path} changed since you read it; the edit applied to the current text.`;
export const changedAfterWrite = (path) =>
  `${path} changed since you read it; the write replaced the current contents.`;
export const noNeedToReread = (path) => `No need to re-read ${path} to confirm this edit.`;
