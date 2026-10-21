import { toCsv } from "./csv.js";

export const COLUMNS = ["name", "email", "company"];

/** The address book as CSV, contacts in the order given. */
export function contactsToCsv(contacts) {
  return toCsv(COLUMNS, contacts);
}
