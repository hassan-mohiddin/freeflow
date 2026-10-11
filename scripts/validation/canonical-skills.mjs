// The portable skills Freeflow ships, taken from the Pi catalog (pi-extension/src/host/catalog.ts, built to dist).
// Checks compare the skills directory, the package and the coverage matrix against this list instead of a fixed count,
// so adding or removing a skill means changing the catalog, and every check follows.

import { FREEFLOW_MODEL_SKILL_NAMES } from "../../pi-extension/dist/host/catalog.js";

export const CANONICAL_SKILL_NAMES = Object.freeze([...FREEFLOW_MODEL_SKILL_NAMES].sort());

/** Differences between a found set of skill names and the canonical list, as readable messages. */
export function skillSetDifferences(found, label) {
  const foundSet = new Set(found);
  const canonical = new Set(CANONICAL_SKILL_NAMES);
  const missing = CANONICAL_SKILL_NAMES.filter((name) => !foundSet.has(name));
  const extra = [...foundSet].filter((name) => !canonical.has(name)).sort();
  const messages = [];
  if (missing.length > 0) messages.push(`${label} is missing canonical skills: ${missing.join(", ")}`);
  if (extra.length > 0) messages.push(`${label} has skills the catalog does not list: ${extra.join(", ")}`);
  return messages;
}
