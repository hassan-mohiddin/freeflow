import { formatPence } from "./money.js";

/** The invoice as the text we email: one line per item, then the total. */
export function printInvoice(invoice) {
  const rows = invoice.lines.map(
    (line) =>
      `${line.description.padEnd(24)} ${String(line.qty).padStart(3)} x ${formatPence(line.unit).padStart(9)}  ${formatPence(line.total).padStart(9)}`,
  );
  return [
    `Invoice for ${invoice.customer}`,
    "",
    ...rows,
    "",
    `${"Total".padEnd(42)} ${formatPence(invoice.total).padStart(9)}`,
  ].join("\n");
}
