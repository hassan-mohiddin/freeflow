import { readFile } from "node:fs/promises";

export const MAX_HITS = 40;

/**
 * Lines matching a query, case-insensitively, in Working Records, each with the record's label and the heading and
 * State of the entry it sits under. Read-only; reads each record on every call.
 */
export async function searchRecords(records, query) {
  const needle = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!needle) throw new Error("Give a query.");
  const hits = [];
  for (const [label, path] of records) {
    let text;
    try {
      text = await readFile(path, "utf8");
    } catch {
      continue;
    }
    let heading = "(header)";
    let state = "";
    for (const line of text.split(/\r?\n/)) {
      const entry = /^#{2,4} (.+)$/.exec(line);
      if (entry) {
        heading = entry[1];
        state = "";
        continue;
      }
      const field = /^- State: (\S+)/.exec(line);
      if (field) state = field[1];
      if (line.toLowerCase().includes(needle) && hits.length <= MAX_HITS)
        hits.push(`- ${label} | ${heading}${state ? ` (${state})` : ""} | ${line.trim()}`);
    }
  }
  if (!hits.length) return `No match for "${String(query).trim()}" in ${records.length} record(s).`;
  const more = hits.length > MAX_HITS ? `\n(more than ${MAX_HITS} matches; narrow the query or scope)` : "";
  return `${hits.slice(0, MAX_HITS).join("\n")}${more}`;
}
