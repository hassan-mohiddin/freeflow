// Agreement between raters on nominal answers: Cohen's kappa for two raters, Krippendorff's alpha for more.
// Answers are compared as categories ("yes", "no", "unknown", 0, 1, 2); `null` or `undefined` is a missing answer.

const missing = (value) => value === null || value === undefined;
const key = (value) => JSON.stringify(value);

/**
 * Cohen's kappa for two raters over the items both answered.
 * `kappa` is null when chance agreement is complete (every answer in one category), where kappa is undefined.
 *
 * @param {Array<[unknown, unknown]>} pairs
 * @returns {{method: "cohen-kappa", items: number, observed: number | null, expected: number | null, kappa: number | null}}
 */
export function cohenKappa(pairs) {
  const rated = pairs.filter(([first, second]) => !missing(first) && !missing(second));
  const items = rated.length;
  if (items === 0) return { method: "cohen-kappa", items, observed: null, expected: null, kappa: null };
  const first = new Map();
  const second = new Map();
  let agreed = 0;
  for (const [left, right] of rated) {
    if (key(left) === key(right)) agreed += 1;
    first.set(key(left), (first.get(key(left)) ?? 0) + 1);
    second.set(key(right), (second.get(key(right)) ?? 0) + 1);
  }
  const observed = agreed / items;
  let expected = 0;
  for (const [category, count] of first) expected += (count / items) * ((second.get(category) ?? 0) / items);
  const kappa = expected === 1 ? null : (observed - expected) / (1 - expected);
  return { method: "cohen-kappa", items, observed, expected, kappa };
}

/**
 * Krippendorff's alpha for nominal data. Each unit is one item's answers, one entry per rater, with missing
 * answers allowed; a unit with fewer than two answers is not pairable and is left out.
 * `alpha` is null when there is no expected disagreement (every pairable answer in one category).
 *
 * @param {Array<Array<unknown>>} units
 * @returns {{method: "krippendorff-alpha", units: number, pairable: number, alpha: number | null}}
 */
export function krippendorffAlpha(units) {
  // Coincidence counts o[c][k], built from every ordered pair of answers within a unit, weighted 1/(m_u - 1).
  const coincidences = new Map();
  let pairableUnits = 0;
  for (const unit of units) {
    const values = unit.filter((value) => !missing(value)).map(key);
    if (values.length < 2) continue;
    pairableUnits += 1;
    const weight = 1 / (values.length - 1);
    for (let left = 0; left < values.length; left += 1) {
      for (let right = 0; right < values.length; right += 1) {
        if (left === right) continue;
        const row = coincidences.get(values[left]) ?? new Map();
        row.set(values[right], (row.get(values[right]) ?? 0) + weight);
        coincidences.set(values[left], row);
      }
    }
  }
  const totals = new Map();
  let total = 0;
  let disagreement = 0;
  for (const [category, row] of coincidences) {
    for (const [other, count] of row) {
      totals.set(category, (totals.get(category) ?? 0) + count);
      total += count;
      if (category !== other) disagreement += count;
    }
  }
  if (total <= 1) return { method: "krippendorff-alpha", units: units.length, pairable: pairableUnits, alpha: null };
  let expected = 0;
  for (const [category, count] of totals) {
    for (const [other, otherCount] of totals) if (category !== other) expected += count * otherCount;
  }
  // alpha = 1 - D_o / D_e, with D_o = disagreement / n and D_e = expected / (n (n - 1)).
  const alpha = expected === 0 ? null : 1 - ((total - 1) * disagreement) / expected;
  return { method: "krippendorff-alpha", units: units.length, pairable: pairableUnits, alpha };
}

/**
 * Agreement between raters, by the method their number calls for: Cohen's kappa for two, Krippendorff's alpha
 * for three or more. Each unit holds one answer per rater, in a fixed rater order.
 *
 * @param {Array<Array<unknown>>} units
 */
export function raterAgreement(units) {
  const raters = Math.max(0, ...units.map((unit) => unit.length));
  if (raters < 2) return null;
  if (raters === 2) return cohenKappa(units.map((unit) => [unit[0], unit[1]]));
  return krippendorffAlpha(units);
}
