export const PASSAGE_TARGET_CHARACTERS = 2_000;
export const PASSAGE_OVERLAP_CHARACTERS = 200;
export const SNIPPET_MAX_CHARACTERS = 400;
export function normalizeText(value) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}
export function tokenize(value) {
  return normalizeText(value).match(/[\p{L}\p{N}_]+(?:[./:@#$%+-][\p{L}\p{N}_]+)*/gu) ?? [];
}
export function unique(values) {
  return [...new Set(values)];
}
function passageEnd(text, start) {
  const target = Math.min(text.length, start + PASSAGE_TARGET_CHARACTERS);
  if (target === text.length) return target;
  const paragraphBreak = text.lastIndexOf("\n\n", target);
  if (paragraphBreak > start + PASSAGE_TARGET_CHARACTERS / 2) return paragraphBreak + 2;
  const lineBreak = text.lastIndexOf("\n", target);
  if (lineBreak > start + PASSAGE_TARGET_CHARACTERS / 2) return lineBreak + 1;
  return target;
}
export function splitTextIntoPassages(text) {
  if (text.length <= PASSAGE_TARGET_CHARACTERS) {
    return [{ text, start: 0, end: text.length, tokens: tokenize(text), length: Math.max(1, tokenize(text).length) }];
  }
  const result = [];
  let start = 0;
  while (start < text.length) {
    const end = passageEnd(text, start);
    const passageText = text.slice(start, end);
    const tokens = tokenize(passageText);
    result.push({ text: passageText, start, end, tokens, length: Math.max(1, tokens.length) });
    if (end >= text.length) break;
    start = Math.max(start + 1, end - PASSAGE_OVERLAP_CHARACTERS);
  }
  return result;
}
export function snippet(text, phrase, terms) {
  if (text.length <= SNIPPET_MAX_CHARACTERS) return text;
  const lower = text.toLocaleLowerCase();
  const phraseIndex = phrase ? lower.indexOf(phrase) : -1;
  const termIndex =
    phraseIndex >= 0
      ? phraseIndex
      : terms.reduce((best, term) => {
          const index = lower.indexOf(term);
          return index >= 0 && (best < 0 || index < best) ? index : best;
        }, -1);
  const center = termIndex >= 0 ? termIndex : 0;
  let start = Math.max(0, center - Math.floor(SNIPPET_MAX_CHARACTERS / 3));
  const end = Math.min(text.length, start + SNIPPET_MAX_CHARACTERS);
  if (end - start < SNIPPET_MAX_CHARACTERS) start = Math.max(0, end - SNIPPET_MAX_CHARACTERS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  const available = SNIPPET_MAX_CHARACTERS - prefix.length - suffix.length;
  const body = text.slice(start, start + available);
  return `${prefix}${body}${suffix}`;
}
