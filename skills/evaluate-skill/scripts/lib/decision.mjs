function assertionMap(assertions) {
  const map = new Map();
  for (const assertion of assertions) {
    if (!assertion || typeof assertion.id !== "string") throw new Error("Every assertion result needs an ID");
    if (!new Set(["pass", "fail", "inconclusive"]).has(assertion.verdict)) throw new Error(`Invalid assertion verdict for ${assertion.id}: ${assertion.verdict}`);
    if (map.has(assertion.id)) throw new Error(`Duplicate assertion ID: ${assertion.id}`);
    map.set(assertion.id, assertion.verdict);
  }
  return map;
}

export function decideSingle(assertions) {
  const verdicts = [...assertionMap(assertions).values()];
  const caseVerdict = verdicts.includes("fail") ? "fail" : verdicts.includes("inconclusive") ? "inconclusive" : "pass";
  return Object.freeze({ evaluation_kind: "single", case_verdict: caseVerdict });
}

export function decideComparison(referenceAssertions, candidateAssertions) {
  const reference = assertionMap(referenceAssertions);
  const candidate = assertionMap(candidateAssertions);
  const referenceIds = [...reference.keys()].sort();
  const candidateIds = [...candidate.keys()].sort();
  if (JSON.stringify(referenceIds) !== JSON.stringify(candidateIds)) throw new Error("Comparison assertion IDs must match exactly");
  const pairs = referenceIds.map((id) => {
    const from = reference.get(id);
    const to = candidate.get(id);
    let change = "unchanged";
    if (from === "inconclusive" || to === "inconclusive") change = "unresolved";
    else if (from === "fail" && to === "pass") change = "improved";
    else if (from === "pass" && to === "fail") change = "regressed";
    return Object.freeze({ id, reference: from, candidate: to, change });
  });
  const changes = new Set(pairs.map((pair) => pair.change));
  const comparisonVerdict = changes.has("unresolved") || (changes.has("improved") && changes.has("regressed"))
    ? "inconclusive"
    : changes.has("regressed") ? "regressed" : changes.has("improved") ? "improved" : "same";
  return Object.freeze({ evaluation_kind: "comparison", comparison_verdict: comparisonVerdict, pairs: Object.freeze(pairs) });
}
