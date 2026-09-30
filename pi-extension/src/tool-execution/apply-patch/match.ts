// Locating a hunk's lines in a file, with the four passes of OpenAI Codex's seek_sequence
// (codex-rs/apply-patch/src/seek_sequence.rs at bcd6d9ab, Apache-2.0): exact, then ignoring trailing whitespace,
// then ignoring surrounding whitespace, then after normalizing Unicode punctuation and spaces.

function normalise(line: string): string {
  return line
    .trim()
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[  -   　]/g, " ");
}

const PASSES: ((line: string) => string)[] = [
  (line) => line,
  (line) => line.trimEnd(),
  (line) => line.trim(),
  normalise,
];

function matchesAt(lines: readonly string[], pattern: readonly string[], at: number, pass: number): boolean {
  const compare = PASSES[pass];
  for (let i = 0; i < pattern.length; i++) if (compare(lines[at + i]) !== compare(pattern[i])) return false;
  return true;
}

/**
 * The first index at or after `start` where `pattern` matches, and the pass that matched. With `endOfFile`, the
 * search starts where the pattern would end the file (falling back to `start` when that is earlier than the file).
 */
export function seekSequence(
  lines: readonly string[],
  pattern: readonly string[],
  start: number,
  endOfFile: boolean,
): { index: number; pass: number } | undefined {
  if (pattern.length === 0) return { index: start, pass: 0 };
  if (pattern.length > lines.length) return undefined;
  const from = endOfFile ? Math.max(lines.length - pattern.length, start) : start;
  for (let pass = 0; pass < PASSES.length; pass++)
    for (let i = from; i <= lines.length - pattern.length; i++)
      if (matchesAt(lines, pattern, i, pass)) return { index: i, pass };
  return undefined;
}

/** Other places in the whole file where the pattern matches with the same pass: a visible sign of ambiguity. */
export function otherMatches(
  lines: readonly string[],
  pattern: readonly string[],
  index: number,
  pass: number,
): number[] {
  if (pattern.length === 0) return [];
  const found: number[] = [];
  for (let i = 0; i <= lines.length - pattern.length; i++)
    if (i !== index && matchesAt(lines, pattern, i, pass)) found.push(i);
  return found;
}
