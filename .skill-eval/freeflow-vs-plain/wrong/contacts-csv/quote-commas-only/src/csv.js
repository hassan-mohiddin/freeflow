// Wrong on purpose: quotes a cell only when it holds a comma, and never escapes quotes or line breaks.
export function toCsvRow(cells) {
  return cells
    .map((cell) => (cell === null || cell === undefined ? "" : String(cell)))
    .map((text) => (text.includes(",") ? `"${text}"` : text))
    .join(",");
}

export function toCsv(columns, rows) {
  const lines = [toCsvRow(columns), ...rows.map((row) => toCsvRow(columns.map((column) => row[column])))];
  return lines.map((line) => `${line}\n`).join("");
}
