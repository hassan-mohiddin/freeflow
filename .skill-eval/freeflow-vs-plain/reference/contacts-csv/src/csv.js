// Minimal CSV writer for the export, following RFC 4180: one row per line, cells separated by commas, and a cell
// holding a comma, a double quote or a line break wrapped in double quotes with its quotes doubled.

/** One cell's text: empty for null or undefined, quoted when it holds a comma, quote or line break. */
export function toCsvCell(cell) {
  const text = cell === null || cell === undefined ? "" : String(cell);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV line from a list of cell values; null and undefined become empty cells. */
export function toCsvRow(cells) {
  return cells.map(toCsvCell).join(",");
}

/** A whole CSV document: a header line, then one line per row, each ending in a newline. */
export function toCsv(columns, rows) {
  const lines = [toCsvRow(columns), ...rows.map((row) => toCsvRow(columns.map((column) => row[column])))];
  return lines.map((line) => `${line}\n`).join("");
}
