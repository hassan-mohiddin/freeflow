import { sha256 } from "./hash.mjs";

function finding(id, sourceSpan, evidence, blockingReason) {
  return { id, severity: "blocking", source_span: sourceSpan, evidence, blocking_reason: blockingReason };
}

function subjectPrompts(evalCase) {
  return Object.hasOwn(evalCase, "prompt") ? [evalCase.prompt] : (evalCase.turns ?? []).map((turn) => turn.prompt);
}

function assertedWrites(evalCase) {
  const paths = new Set();
  for (const assertion of evalCase.assertions ?? []) {
    if (assertion.type === "changed_paths") for (const path of assertion.equals ?? []) paths.add(path);
  }
  return [...paths].sort();
}

export async function compileCaseFeasibility(evalCase, context) {
  const findings = [];
  const prompts = subjectPrompts(evalCase);
  const promptText = prompts.join("\n");
  const tools = new Set(evalCase.execution?.tools ?? []);
  const declaration = evalCase.feasibility ?? {};

  const missingEvidence = (declaration.required_evidence_paths ?? []).filter((path) => !(context.fixtureFiles ?? []).includes(path));
  if (missingEvidence.length > 0) findings.push(finding("FEAS-EVIDENCE-MISSING", "case.feasibility.required_evidence_paths", { missing_paths: missingEvidence, fixture_files: context.fixtureFiles ?? [] }, "Required rubric evidence is absent from the fixture."));
  const unnamedEvidence = (declaration.required_evidence_paths ?? []).filter((path) => !promptText.includes(path));
  if (unnamedEvidence.length > 0 && !tools.has("ls") && !tools.has("find")) {
    findings.push(finding("FEAS-EVIDENCE-DISCOVERY", "case.feasibility.required_evidence_paths", { unnamed_paths: unnamedEvidence, tools: [...tools] }, "Required evidence is unnamed and the subject cannot list fixture contents."));
  }

  for (let index = 0; index < (declaration.literal_requirements ?? []).length; index += 1) {
    const requirement = declaration.literal_requirements[index];
    let source = null;
    if (requirement.source === "prompt") source = promptText;
    else if (typeof requirement.source === "string" && requirement.source.startsWith("fixture:")) source = await context.readFixture(requirement.source.slice("fixture:".length));
    if (requirement.equivalence_class && !(declaration.accepted_equivalences ?? []).includes(requirement.equivalence_class)) {
      findings.push(finding("FEAS-EQUIVALENCE", `case.feasibility.literal_requirements[${index}].equivalence_class`, { equivalence_class: requirement.equivalence_class, accepted: declaration.accepted_equivalences ?? [] }, "A semantic/setup equivalence is required but not declared as accepted."));
    }
    if (typeof source !== "string" || !source.includes(requirement.value)) {
      findings.push(finding("FEAS-LITERAL-SOURCE", `case.feasibility.literal_requirements[${index}]`, { value: requirement.value, source: requirement.source, source_sha256: typeof source === "string" ? sha256(source) : null, source_bytes: typeof source === "string" ? Buffer.byteLength(source) : null, matched: false }, "An exact literal requirement is not supported by its declared source."));
    }
  }

  const changedByScope = new Map();
  for (const assertion of (evalCase.assertions ?? []).filter((item) => item.type === "changed_paths")) {
    const scope = assertion.turn_id ?? "final";
    const expectation = JSON.stringify([...(assertion.equals ?? [])].sort());
    const values = changedByScope.get(scope) ?? [];
    values.push(expectation);
    changedByScope.set(scope, values);
  }
  for (const [scope, values] of changedByScope) {
    if (new Set(values).size > 1) findings.push(finding("FEAS-CHANGED-PATH-CONFLICT", "case.assertions", { scope, changed_path_expectations: values.map((value) => JSON.parse(value)) }, "Changed-path assertions define conflicting output contracts for one evidence scope."));
  }
  const writes = assertedWrites(evalCase);
  if (context.modelDriven !== false && writes.length > 0 && !tools.has("write")) {
    findings.push(finding("FEAS-OUTPUT-TOOL", "case.execution.tools", { asserted_writes: writes, tools: [...tools] }, "Assertions require written output but the subject has no write tool."));
  }

  const active = new Set(declaration.active_context_components ?? []);
  for (const assertion of evalCase.assertions ?? []) {
    if (assertion.turn_id && ["component_read", "skill_read"].includes(assertion.type) && ((assertion.type === "skill_read" && declaration.active_context_skill === true) || active.has(assertion.component))) {
      const turnIndex = (evalCase.turns ?? []).findIndex((turn) => turn.id === assertion.turn_id);
      if (turnIndex > 0) findings.push(finding("FEAS-REDUNDANT-REREAD", `case.assertions.${assertion.id}`, { assertion, active_context_components: [...active] }, "A later-turn reread is required even though active-context presence is the intended evidence."));
    }
  }

  for (const assertion of (evalCase.assertions ?? []).filter((item) => item.type === "semantic")) {
    const leakedTurn = prompts.findIndex((prompt) => assertion.rubric && prompt.includes(assertion.rubric));
    if (leakedTurn >= 0) findings.push(finding("FEAS-RUBRIC-LEAK", Object.hasOwn(evalCase, "prompt") ? "case.prompt" : `case.turns[${leakedTurn}].prompt`, { assertion_id: assertion.id }, "The fixed grader rubric is visible to the subject."));
  }

  const scriptedTurns = Object.hasOwn(evalCase, "prompt") ? 1 : (evalCase.turns ?? []).length;
  const requiredTurns = scriptedTurns + Number(declaration.expected_tool_round_trips ?? 0);
  if (context.modelDriven !== false && Number(declaration.expected_tool_round_trips ?? 0) > 0 && context.maxTurns < requiredTurns) findings.push(finding("FEAS-TURN-BUDGET", "limits.max_turns_per_process", { supplied: context.maxTurns, required: requiredTurns, scripted_turns: scriptedTurns }, "The hard turn budget cannot cover scripted turns plus declared tool round trips."));
  if (context.modelDriven !== false && context.estimatedCompactBytes > context.outputLimitBytes) findings.push(finding("FEAS-COMPACT-LIMIT", "limits.output_limit_bytes", { estimated: context.estimatedCompactBytes, limit: context.outputLimitBytes }, "The compact model packet exceeds its retained-output limit."));
  if (context.modelDriven !== false && context.estimatedTransportBytes > context.transportLimitBytes) findings.push(finding("FEAS-TRANSPORT-LIMIT", "limits.transport_limit_bytes", { estimated: context.estimatedTransportBytes, limit: context.transportLimitBytes }, "Raw transport exceeds its separate safeguard."));

  if (declaration.fixture_oracle) {
    const outcome = context.runOracle ? await context.runOracle(declaration.fixture_oracle) : null;
    const expectedText = declaration.fixture_oracle.stdout_contains ?? [];
    if (!outcome || outcome.timed_out || outcome.exit_code !== declaration.fixture_oracle.expected_exit || expectedText.some((text) => !outcome.stdout.includes(text))) {
      findings.push(finding("FEAS-FIXTURE-ORACLE", "case.feasibility.fixture_oracle", { expected: { exit_code: declaration.fixture_oracle.expected_exit, stdout_contains: expectedText }, observed: outcome ? { exit_code: outcome.exit_code, signal: outcome.signal, timed_out: outcome.timed_out, stdout_sha256: sha256(outcome.stdout ?? ""), stdout_bytes: Buffer.byteLength(outcome.stdout ?? ""), stderr_sha256: sha256(outcome.stderr ?? ""), stderr_bytes: Buffer.byteLength(outcome.stderr ?? "") } : null }, "The provider-free fixture oracle does not reproduce the declared pressure."));
    }
  }

  return { schema_version: 1, case_id: evalCase.id, blocking: findings.length > 0, provider_requests: 0, findings };
}

export function renderFeasibilityRows(result) {
  return result.findings.map((item) => `BLOCK|${item.id}|${item.source_span}|${item.blocking_reason.replaceAll("|", "\\|")}`).join("\n") + (result.findings.length ? "\n" : "");
}
