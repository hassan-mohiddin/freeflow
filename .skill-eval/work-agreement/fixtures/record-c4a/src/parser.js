// Splits one CSV line into fields. Fields may be quoted with double quotes.
export function parseLine(line) {
  return line.split(",").map((field) => field.trim().replace(/^"(.*)"$/, "$1"));
}
