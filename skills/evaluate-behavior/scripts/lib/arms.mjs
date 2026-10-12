// Arm names and the reference arm, shared by the loader, runner, graders, aggregate, view and review.
// A group's arms are its loaded `variants`, reference first; evidence written before named arms, and test
// fixtures without them, are read as the two classic arms.

export const DEFAULT_ARMS = Object.freeze(["baseline", "candidate"]);
export const DEFAULT_REFERENCE = "baseline";
export const ARM_NAME = /^[a-z][a-z0-9-]{0,31}$/;

function keysOf(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];
}

/** The arms of a loaded group (or a stored definition), reference first. */
export function armNames(group) {
  const names = keysOf(group?.variants);
  return names.length > 0 ? names : [...DEFAULT_ARMS];
}

export function referenceArm(group) {
  return typeof group?.reference === "string" ? group.reference : DEFAULT_REFERENCE;
}

/** The arms of a stored group: its summary entry's run states, then its definition, then the classic pair. */
export function storedArms(summaryGroup, definition) {
  const fromSummary = keysOf(summaryGroup?.variants);
  return fromSummary.length > 0 ? fromSummary : armNames(definition);
}

/**
 * Exactly `baseline` and `candidate` with `baseline` as the reference: such a group keeps every output shape it
 * had before named arms, so existing readers keep working. Any other group uses the arm-keyed shapes.
 */
export function isClassicPair(arms, reference = DEFAULT_REFERENCE) {
  return (
    reference === DEFAULT_REFERENCE &&
    arms.length === 2 &&
    arms.includes(DEFAULT_ARMS[0]) &&
    arms.includes(DEFAULT_ARMS[1])
  );
}

/**
 * One grade comparison in the arm-keyed form, whichever shape it was stored in: `{ reference, arms: { <arm>:
 * { check, state } }, transitions: { <non-reference arm>: transition } }`.
 */
export function comparisonArms(comparison) {
  if (comparison?.arms !== undefined) {
    return { reference: comparison.reference, arms: comparison.arms, transitions: comparison.transitions ?? {} };
  }
  return {
    reference: DEFAULT_REFERENCE,
    arms: { baseline: comparison?.baseline, candidate: comparison?.candidate },
    transitions: { candidate: comparison?.transition },
  };
}
