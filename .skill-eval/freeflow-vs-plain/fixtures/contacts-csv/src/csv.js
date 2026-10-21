// Minimal CSV writer for the export. One row per line, cells separated by commas.

/** One CSV line from a list of cell values; null and undefined become empty cells. */
export function toCsvRow(cells) {
  return cells.map((cell) => (cell === null || cell === undefined ? "" : String(cell))).join(",");
}

/** A whole CSV document: a header line, then one line per row, each ending in a newline. */
export function toCsv(columns, rows) {
  const lines = [toCsvRow(columns), ...rows.map((row) => toCsvRow(columns.map((column) => row[column])))];
  return lines.map((line) => `${line}\n`).join("");
}
