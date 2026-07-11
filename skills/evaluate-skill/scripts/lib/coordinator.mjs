import { decideComparison, decideSingle } from "./decision.mjs";
import { createEvaluationLedger, failedPublication, incompleteOperation } from "./outcome.mjs";

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

async function invokeOperation(operation, ...args) {
  try {
    return await operation(...args);
  } catch (error) {
    return incompleteOperation({ primary: message(error) });
  }
}

async function invokePublication(operation, payload) {
  try {
    return await operation(payload);
  } catch (error) {
    return failedPublication(message(error));
  }
}

function canStartProcess(ledger, maxUsd) {
  if (maxUsd === null || maxUsd === undefined) return true;
  const cost = ledger.publicUsage().cost_usd;
  return cost === null || cost < maxUsd;
}

function mergeSemanticAssertions(subjectAssertions, semanticIds, semanticValue) {
  const expected = [...semanticIds].sort();
  const actual = (semanticValue?.assertions ?? []).map((item) => item.id).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Semantic assertion IDs do not match: expected ${expected.join(", ")}; got ${actual.join(", ")}`);
  const semantic = new Map(semanticValue.assertions.map((item) => [item.id, item.verdict]));
  return subjectAssertions.map((assertion) => semantic.has(assertion.id) ? { ...assertion, verdict: semantic.get(assertion.id) } : assertion);
}

async function incompleteResult(plan, ledger, failure, completed, publishDiagnostic) {
  const diagnostic = {
    schema_version: 1,
    plan_fingerprint: plan.fingerprint,
    skill: plan.skill,
    case_id: plan.case_id,
    failure,
    completed_variants: completed.map(({ id, role }) => ({ id, role })),
    usage: ledger.publicUsage(),
    limitations: plan.limitations ?? [],
  };
  const publication = await invokePublication(publishDiagnostic, diagnostic);
  const outcome = {
    status: "incomplete",
    failure,
    usage: diagnostic.usage,
    limitations: diagnostic.limitations,
  };
  if (publication.status === "published") outcome.diagnostic = publication.path;
  else outcome.diagnostic_publication = publication;
  return Object.freeze(outcome);
}

function validateSubjectValue(value) {
  if (!value || !Array.isArray(value.assertions)) throw new Error("Subject outcome must contain assertions");
  const semanticIds = value.semantic_assertion_ids ?? [];
  if (!Array.isArray(semanticIds)) throw new Error("semantic_assertion_ids must be an array");
  return { assertions: value.assertions, semanticIds };
}

export async function coordinateEvaluation(plan, dependencies) {
  const { runSubject, runSemantic, publishResult, publishDiagnostic } = dependencies;
  const ledger = createEvaluationLedger({ modelDriven: plan.model_driven });
  const completed = [];

  for (const variant of plan.variants) {
    if (!canStartProcess(ledger, plan.max_usd)) {
      return incompleteResult(plan, ledger, { primary: `Observed spend ceiling reached before ${variant.role} subject process`, secondary: null }, completed, publishDiagnostic);
    }

    const subject = await invokeOperation(runSubject, variant);
    if (subject.execution) ledger.record(subject.execution);
    if (subject.status === "incomplete") return incompleteResult(plan, ledger, subject.failure, completed, publishDiagnostic);

    let assertions;
    let semanticIds;
    try {
      ({ assertions, semanticIds } = validateSubjectValue(subject.value));
    } catch (error) {
      return incompleteResult(plan, ledger, { primary: message(error), secondary: null }, completed, publishDiagnostic);
    }

    let semantic = null;
    if (semanticIds.length > 0 && !assertions.some((assertion) => assertion.verdict === "fail")) {
      if (!runSemantic) return incompleteResult(plan, ledger, { primary: "Semantic assertions require a semantic process", secondary: null }, completed, publishDiagnostic);
      if (!canStartProcess(ledger, plan.max_usd)) {
        return incompleteResult(plan, ledger, { primary: `Observed spend ceiling reached before ${variant.role} semantic process`, secondary: null }, completed, publishDiagnostic);
      }
      semantic = await invokeOperation(runSemantic, variant, { assertions, semantic_assertion_ids: semanticIds });
      if (semantic.execution) ledger.record(semantic.execution);
      if (semantic.status === "incomplete") return incompleteResult(plan, ledger, semantic.failure, completed, publishDiagnostic);
      try {
        assertions = mergeSemanticAssertions(assertions, semanticIds, semantic.value);
      } catch (error) {
        return incompleteResult(plan, ledger, { primary: message(error), secondary: null }, completed, publishDiagnostic);
      }
    }

    completed.push(Object.freeze({
      id: variant.id,
      role: variant.role,
      subject: subject.value,
      semantic: semantic?.value ?? null,
      assertions: Object.freeze(assertions.map((assertion) => Object.freeze({ ...assertion }))),
    }));
  }

  let decision;
  try {
    decision = plan.evaluation_kind === "single"
      ? decideSingle(completed[0].assertions)
      : decideComparison(completed[0].assertions, completed[1].assertions);
  } catch (error) {
    return incompleteResult(plan, ledger, { primary: message(error), secondary: null }, completed, publishDiagnostic);
  }

  const result = Object.freeze({
    schema_version: 1,
    plan_fingerprint: plan.fingerprint,
    skill: plan.skill,
    case_id: plan.case_id,
    evaluation_kind: plan.evaluation_kind,
    decision,
    variants: Object.freeze(completed),
    evidence_support: plan.evidence_support,
    usage: ledger.publicUsage(),
    limitations: Object.freeze([...(plan.limitations ?? [])]),
  });
  const publication = await invokePublication(publishResult, result);
  if (publication.status !== "published") {
    return incompleteResult(plan, ledger, { primary: `Result publication failed: ${publication.failure.primary}`, secondary: publication.failure.secondary }, completed, publishDiagnostic);
  }
  return Object.freeze({
    status: "complete",
    decision,
    result: publication.path,
    usage: result.usage,
    limitations: result.limitations,
  });
}
