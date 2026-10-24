import { formatAmount } from "./amount.js";

const cell = (value) => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/** The entries as CSV, in the same columns the import reads. */
export function exportCsv(entries) {
  const rows = entries.map((entry) =>
    [entry.date, entry.category, entry.description, formatAmount(entry.cents)].map(cell).join(","),
  );
  return ["date,category,description,amount", ...rows].join("\n") + "\n";
}
