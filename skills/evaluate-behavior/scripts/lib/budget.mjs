// The cost ceiling (`--max-cost`), shared by every subject of a run or of all its trials. Reserve-then-charge:
// a subject reserves the mean cost of the subjects finished so far (zero before any finished) before it starts,
// and is charged its host-reported cost when it ends. A subject may not start once the spent cost plus what the
// running subjects reserved reaches the ceiling, so the overshoot is bounded by the running set. A subject that
// is running when the ceiling is reached completes and is charged.

/** @param {number | null | undefined} maxCost */
export function createBudget(maxCost) {
  if (maxCost === null || maxCost === undefined) return null;
  return { maxCost, spent: 0, exhausted: false, reserved: 0, finished: 0 };
}

/**
 * Reserves an estimate for one subject, or returns null (and marks the budget exhausted) when it may not start.
 *
 * @returns {{amount: number} | null}
 */
export function reserve(budget) {
  if (budget === null || budget === undefined) return { amount: 0 };
  budget.reserved ??= 0;
  budget.finished ??= 0;
  if (budget.exhausted || budget.spent + budget.reserved >= budget.maxCost) {
    budget.exhausted = true;
    return null;
  }
  const amount = budget.finished > 0 ? budget.spent / budget.finished : 0;
  budget.reserved += amount;
  return { amount };
}

/** Releases a subject's reservation and charges what it actually cost. */
export function charge(budget, reservation, cost) {
  if (budget === null || budget === undefined) return;
  budget.reserved = Math.max(0, (budget.reserved ?? 0) - (reservation?.amount ?? 0));
  budget.spent += cost;
  budget.finished = (budget.finished ?? 0) + 1;
  if (budget.spent >= budget.maxCost) budget.exhausted = true;
}

/** The budget as evidence: the ceiling, what was spent, whether it ran out, and how far spending passed it. */
export function budgetEvidence(budget) {
  const spent = Number(budget.spent.toFixed(10));
  return {
    maxCost: budget.maxCost,
    spent,
    exhausted: budget.exhausted,
    overshoot: Number(Math.max(0, budget.spent - budget.maxCost).toFixed(10)),
  };
}
