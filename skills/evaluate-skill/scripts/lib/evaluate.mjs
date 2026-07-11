import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, relative, resolve, sep } from "node:path";
import { coordinateEvaluation } from "./coordinator.mjs";
import { createManifest, captureGitEvidence, copyDirectory, initializeFixtureGit, makeWritable, materializeSkillVariant, removeWritableTree } from "./materialize.mjs";
import { hashDeclaredResources, hashDirectory } from "./hash.mjs";
import { gradeObjectiveRun } from "./grade.mjs";
import { verifyBundleIntegrity, writeBundleIntegrity } from "./integrity.mjs";
import { incompleteOperation } from "./outcome.mjs";
import { PI_ADAPTER_VERSION, redactedInvocation, runPiSubject } from "./pi-adapter.mjs";
import { createStagingDirectory, publishDiagnostic as publishDiagnosticBundle, publishResult as publishResultBundle } from "./publication.mjs";
import { gradeSemanticRun } from "./semantic.mjs";

function evaluationId(plan) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `${timestamp}-${plan.eval_case.id.toLowerCase()}-${plan.fingerprint.slice(0, 10)}`;
}

function relativeRepoPath(repoRoot, path) {
  return relative(repoRoot, path).split(sep).join("/");
}

async function copyWithoutGit(source, destination) {
  await cp(source, destination, { recursive: true, force: true, filter: (path) => basename(path) !== ".git" });
  await makeWritable(destination);
}

function processFailed(subject) {
  return subject.process.code !== 0
    || subject.process.timed_out
    || subject.process.output_limit_exceeded
    || subject.process.transport_limit_exceeded
    || subject.runtime_counters.hard_turn_limit_reached
    || subject.parsed.parse_errors.length > 0;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertionVerdicts(objective, semantic) {
  const semanticById = new Map((semantic?.assertions ?? []).map((item) => [item.id, item.verdict]));
  return objective.assertions.map((assertion) => {
    let verdict;
    if (assertion.state === "pass") verdict = "pass";
    else if (assertion.state === "fail" || assertion.state === "error") verdict = "fail";
    else {
      const semanticVerdict = semanticById.get(assertion.id);
      verdict = semanticVerdict === "uncertain" || semanticVerdict === undefined ? "inconclusive" : semanticVerdict;
    }
    return { id: assertion.id, verdict, evidence: assertion.evidence };
  });
}

async function executeVariant(workspace, plan, variant, evidenceDir, id, dependencies) {
  const runtimeRoot = await mkdtemp(resolve(tmpdir(), "freeflow-skill-eval-"));
  const fixtureRoot = resolve(runtimeRoot, "fixture");
  const snapshotRoot = resolve(runtimeRoot, "skill");
  const configRoot = resolve(runtimeRoot, "pi-config");
  const cleanupRuntime = dependencies.cleanupRuntime ?? removeWritableTree;
  let subject = null;
  let execution = null;
  let value = null;
  let primaryFailure = null;
  let cleanupFailure = null;
  try {
    await mkdir(fixtureRoot, { recursive: true });
    if (plan.fixture_path) {
      await copyDirectory(plan.fixture_path, fixtureRoot);
      await makeWritable(fixtureRoot);
      const copiedFixtureHash = await hashDirectory(fixtureRoot);
      if (copiedFixtureHash !== plan.summary.identities.fixture) throw new Error("Fixture changed after preflight approval");
    }
    await initializeFixtureGit(fixtureRoot);
    const beforeManifest = await createManifest(fixtureRoot);

    if (variant.kind === "working-tree") {
      const currentSourceHash = await hashDeclaredResources(variant.absolute_path, variant.resources);
      if (currentSourceHash !== variant.snapshot_hash) throw new Error(`Subject source changed after preflight for ${variant.role}`);
    }
    await materializeSkillVariant(workspace.repoRoot, variant, snapshotRoot);
    const subjectHashBefore = await hashDirectory(snapshotRoot);
    if (subjectHashBefore !== variant.snapshot_hash) throw new Error(`Materialized subject differs from approved resources for ${variant.role}`);
    const skillManifest = await createManifest(snapshotRoot);

    if (plan.eval_case.execution.host !== "none") {
      subject = await dependencies.runSubject({
        prompt: plan.eval_case.prompt,
        provider: plan.plan_inputs.model.provider,
        model: plan.plan_inputs.model.model,
        thinking: plan.plan_inputs.model.thinking,
        tools: plan.eval_case.execution.tools,
        skillSnapshot: snapshotRoot,
        workspace: fixtureRoot,
        configDir: configRoot,
        readRoots: [fixtureRoot, snapshotRoot],
        writeRoots: [fixtureRoot],
        timeoutMs: plan.plan_inputs.limits.timeout_ms,
        outputLimitBytes: plan.plan_inputs.limits.output_limit_bytes,
        transportLimitBytes: plan.plan_inputs.limits.transport_limit_bytes,
        maxTurns: plan.plan_inputs.limits.max_turns_per_process,
      });
      execution = {
        id: `subject-${variant.role}`,
        kind: "subject",
        role: variant.role,
        usage: subject.parsed.usage,
        runtime_counters: subject.runtime_counters,
        process: {
          exit_code: subject.process.code,
          signal: subject.process.signal,
          timed_out: subject.process.timed_out,
          output_limit_exceeded: subject.process.output_limit_exceeded,
          transport_limit_exceeded: subject.process.transport_limit_exceeded,
          transport_bytes: subject.process.transport_bytes,
          retained_output_bytes: subject.process.retained_output_bytes,
          parse_errors: subject.parsed.parse_errors,
        },
      };
    }
    const subjectFailure = subject !== null && processFailed(subject);

    const subjectHashAfter = await hashDirectory(snapshotRoot);
    if (subjectHashBefore !== subjectHashAfter) throw new Error(`Subject resources mutated during ${variant.role}`);
    const afterManifest = await createManifest(fixtureRoot);
    const git = await captureGitEvidence(fixtureRoot);

    const counters = subject?.runtime_counters ?? { provider_requests: 0, turns_started: 0, tool_calls: 0, hard_turn_limit_reached: false };
    const metadata = {
      schema_version: 1,
      evaluation_id: id,
      skill: workspace.suite.skill,
      case_id: plan.eval_case.id,
      variant: variant.id,
      role: variant.role,
      subject_resources: variant.resources,
      subject_source_hash: variant.snapshot_hash,
      materialized_subject_hash: subjectHashBefore,
      host: plan.eval_case.execution.host,
      adapter_version: PI_ADAPTER_VERSION,
      provider: plan.plan_inputs.model?.provider ?? null,
      model: plan.plan_inputs.model?.model ?? null,
      thinking: plan.plan_inputs.model?.thinking ?? null,
      tools: plan.eval_case.execution.tools,
      hard_limits: plan.plan_inputs.limits,
      invocation: subject ? redactedInvocation(subject.invocation) : { command: null, args: [] },
      evidence_classes: { required: plan.summary.evidence.required, requested: plan.summary.evidence.requested },
      usage: subject?.parsed.usage ?? null,
      runtime_counters: counters,
      activation: { skill_read: subject?.parsed.skill_read ?? false },
      changed_paths: git.changedPaths,
      assertion_root: plan.eval_case.execution.host === "none" ? "skill" : "workspace",
      skill_manifest: skillManifest,
      process: subject ? {
        exit_code: subject.process.code,
        signal: subject.process.signal,
        timed_out: subject.process.timed_out,
        output_limit_exceeded: subject.process.output_limit_exceeded,
        transport_limit_exceeded: subject.process.transport_limit_exceeded,
        transport_bytes: subject.process.transport_bytes,
        retained_output_bytes: subject.process.retained_output_bytes,
        hard_turn_limit_reached: counters.hard_turn_limit_reached,
        parse_errors: subject.parsed.parse_errors,
      } : { exit_code: 0, signal: null, timed_out: false, output_limit_exceeded: false, transport_limit_exceeded: false, transport_bytes: 0, retained_output_bytes: 0, hard_turn_limit_reached: false, parse_errors: [] },
    };
    if (dependencies.persistVariantEvidence) {
      await dependencies.persistVariantEvidence({ evidenceDir, metadata, beforeManifest, afterManifest, subject, counters, git });
    } else {
      await mkdir(resolve(evidenceDir, "inputs"), { recursive: true });
      await mkdir(resolve(evidenceDir, "artifacts"), { recursive: true });
      await writeFile(resolve(evidenceDir, "inputs", "case.json"), `${JSON.stringify(plan.eval_case, null, 2)}\n`);
      await copyWithoutGit(snapshotRoot, resolve(evidenceDir, "inputs", "skill"));
      await copyWithoutGit(fixtureRoot, resolve(evidenceDir, "artifacts", "workspace"));
      await Promise.all([
        writeFile(resolve(evidenceDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`),
        writeFile(resolve(evidenceDir, "before-manifest.json"), `${JSON.stringify(beforeManifest, null, 2)}\n`),
        writeFile(resolve(evidenceDir, "after-manifest.json"), `${JSON.stringify(afterManifest, null, 2)}\n`),
        writeFile(resolve(evidenceDir, "final.md"), subject?.parsed.final_text ?? ""),
        writeFile(resolve(evidenceDir, "events.jsonl"), subject?.process.stdout ?? ""),
        writeFile(resolve(evidenceDir, "tool-events.json"), `${JSON.stringify(subject?.parsed.tool_events ?? [], null, 2)}\n`),
        writeFile(resolve(evidenceDir, "runtime-counters.json"), `${JSON.stringify(counters, null, 2)}\n`),
        writeFile(resolve(evidenceDir, "stderr.log"), subject?.process.stderr ?? ""),
        writeFile(resolve(evidenceDir, "diff"), git.diff),
        writeFile(resolve(evidenceDir, "git-status.txt"), git.status),
        writeFile(resolve(evidenceDir, "exit-status.txt"), `${subject?.process.code ?? 0}\n`),
        writeFile(resolve(evidenceDir, "usage.json"), `${JSON.stringify(subject?.parsed.usage ?? null, null, 2)}\n`),
      ]);
    }
    if (subjectFailure) throw new Error(`Subject ${variant.role} produced unusable evidence or exited with ${subject.process.code}`);
    const objective = await gradeObjectiveRun(evidenceDir);
    await writeFile(resolve(evidenceDir, "objective-grade.json"), `${JSON.stringify(objective, null, 2)}\n`);
    value = {
      evidence_dir: evidenceDir,
      metadata,
      objective,
      assertions: assertionVerdicts(objective, null),
      semantic_assertion_ids: objective.assertions.filter((assertion) => assertion.state === "pending-semantic").map((assertion) => assertion.id),
    };
  } catch (error) {
    primaryFailure = errorMessage(error);
  } finally {
    try {
      await cleanupRuntime(runtimeRoot);
    } catch (error) {
      cleanupFailure = errorMessage(error);
    }
  }

  if (primaryFailure || cleanupFailure) {
    return {
      status: "incomplete",
      execution,
      failure: { primary: primaryFailure ?? cleanupFailure, secondary: primaryFailure ? cleanupFailure : null },
    };
  }
  return { status: "complete", execution, value };
}

function renderReport(plan, decision, variants, usage, limitations) {
  return [
    `# ${plan.eval_case.id} Evaluation`,
    "",
    `Kind: ${plan.eval_case.evaluation_kind}`,
    `Decision: ${decision.case_verdict ?? decision.comparison_verdict}`,
    "",
    "## Variants",
    "",
    ...variants.map((variant) => `- ${variant.role}: ${variant.assertions.map((item) => `${item.id}=${item.verdict}`).join(", ")}`),
    "",
    "## Usage",
    "",
    `- Turns: ${usage.turns}`,
    `- Provider requests: ${usage.provider_requests}`,
    `- Cost USD: ${usage.cost_usd ?? "unavailable"}`,
    "",
    "## Limitations",
    "",
    ...(limitations.length > 0 ? limitations.map((item) => `- ${item}`) : ["- None recorded."]),
    "",
  ].join("\n");
}

export async function executeEvaluation(workspace, plan, dependencies = {}) {
  const runSubject = dependencies.runSubject ?? runPiSubject;
  const gradeSemantic = dependencies.gradeSemantic ?? gradeSemanticRun;
  const id = evaluationId(plan);
  const runsRoot = resolve(workspace.skillRoot, "runs");
  const stagingDir = resolve(runsRoot, `.staging-${id}`);
  const finalDir = resolve(runsRoot, "evaluations", id);
  const diagnosticDir = resolve(runsRoot, "diagnostics", id);
  await mkdir(runsRoot, { recursive: true });
  const staging = await createStagingDirectory(stagingDir, dependencies.publicationOperations);
  if (staging.status === "incomplete") {
    return { status: "incomplete", failure: staging.failure, usage: { turns: 0, provider_requests: 0, tool_calls: 0, tokens: null, cost_usd: null }, limitations: plan.summary.limitations };
  }
  try {
    await writeFile(resolve(stagingDir, "plan.json"), `${JSON.stringify({ schema_version: 1, ...plan.summary }, null, 2)}\n`);
  } catch (error) {
    return { status: "incomplete", failure: { primary: errorMessage(error), secondary: null }, usage: { turns: 0, provider_requests: 0, tool_calls: 0, tokens: null, cost_usd: null }, limitations: plan.summary.limitations };
  }

  const coordinatorPlan = {
    fingerprint: plan.fingerprint,
    skill: workspace.suite.skill,
    case_id: plan.eval_case.id,
    evaluation_kind: plan.eval_case.evaluation_kind,
    model_driven: plan.eval_case.execution.host !== "none",
    max_usd: plan.plan_inputs.max_usd,
    evidence_support: plan.summary.evidence,
    limitations: plan.summary.limitations,
    variants: plan.variants.map(({ id: variantId, role }) => ({ id: variantId, role })),
  };
  const variantByRole = new Map(plan.variants.map((variant) => [variant.role, variant]));

  const outcome = await coordinateEvaluation(coordinatorPlan, {
    runSubject: async ({ role }) => executeVariant(
      workspace,
      plan,
      variantByRole.get(role),
      resolve(stagingDir, "evidence", role),
      id,
      { runSubject, persistVariantEvidence: dependencies.persistVariantEvidence, cleanupRuntime: dependencies.cleanupRuntime },
    ),
    runSemantic: async ({ role }) => {
      const semantic = await gradeSemantic(resolve(stagingDir, "evidence", role), {
        provider: plan.plan_inputs.model.provider,
        model: plan.plan_inputs.model.model,
        thinking: plan.plan_inputs.model.thinking,
        max_turns_per_process: plan.plan_inputs.limits.max_turns_per_process,
        timeout_ms: plan.plan_inputs.limits.timeout_ms,
        output_limit_bytes: plan.plan_inputs.limits.output_limit_bytes,
        transport_limit_bytes: plan.plan_inputs.limits.transport_limit_bytes,
      });
      const execution = semantic.execution ? {
        id: `semantic-${role}`,
        kind: "semantic",
        role,
        ...semantic.execution,
        process: semantic.execution.process ?? { exit_code: 1, signal: null, timed_out: false, output_limit_exceeded: false, parse_errors: [] },
      } : null;
      if (semantic.status === "incomplete") return incompleteOperation({ execution, primary: semantic.failure.primary, secondary: semantic.failure.secondary ?? semantic.failure.cleanup ?? null });
      const grade = semantic.grade;
      return {
        status: "complete",
        execution,
        value: {
          assertions: grade.assertions.map((assertion) => ({ ...assertion, verdict: assertion.verdict === "uncertain" ? "inconclusive" : assertion.verdict })),
          uncertainty: grade.uncertainty ?? null,
          grade,
        },
      };
    },
    publishResult: async (coordinated) => {
      const variants = coordinated.variants.map((variant) => ({
        id: variant.id,
        role: variant.role,
        subject_identity: variantByRole.get(variant.role).snapshot_hash,
        objective: { verdict: variant.subject.objective.verdict, assertions: variant.subject.objective.assertions },
        semantic: variant.semantic?.grade ?? null,
        assertions: variant.assertions,
      }));
      const candidate = variants.find((variant) => variant.role === "candidate" || variant.role === "subject");
      const residualUncertainty = variants.flatMap((variant) => [
        ...variant.assertions.filter((assertion) => assertion.verdict === "inconclusive").map((assertion) => `${variant.role}:${assertion.id}`),
        ...(variant.semantic?.uncertainty ? [`${variant.role}: ${variant.semantic.uncertainty}`] : []),
      ]);
      const unavailable = [
        ...(coordinated.usage.cost_usd === null ? ["usage.cost_usd"] : []),
        ...(coordinated.usage.tokens === null ? ["usage.tokens"] : []),
      ];
      const result = {
        schema_version: 1,
        evaluation_id: id,
        skill: workspace.suite.skill,
        case_id: plan.eval_case.id,
        plan_fingerprint: plan.fingerprint,
        identities: plan.summary.identities,
        evaluation_kind: plan.eval_case.evaluation_kind,
        decision: coordinated.decision,
        variants,
        evidence_support: plan.summary.evidence,
        unsupported_claims: Object.entries(plan.summary.evidence.requested).filter(([, state]) => state === "unsupported").map(([name]) => name),
        usage: coordinated.usage,
        unavailable,
        limitations: plan.summary.limitations,
        residual_uncertainty: residualUncertainty,
        readiness: { required_for_bootstrap: plan.eval_case.required_for_bootstrap, candidate_assertions_pass: candidate.assertions.every((assertion) => assertion.verdict === "pass") },
      };
      const publication = await publishResultBundle({
        stagingDir,
        destinationDir: finalDir,
        operations: dependencies.publicationOperations,
        prepare: async () => {
          await writeFile(resolve(stagingDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
          await writeFile(resolve(stagingDir, "report.md"), renderReport(plan, coordinated.decision, variants, coordinated.usage, plan.summary.limitations));
          await writeBundleIntegrity(stagingDir);
        },
        verify: async () => verifyBundleIntegrity(stagingDir),
      });
      return publication.status === "published"
        ? { status: "published", path: relativeRepoPath(workspace.repoRoot, resolve(finalDir, "result.json")) }
        : publication;
    },
    publishDiagnostic: async (diagnostic) => {
      const publication = await publishDiagnosticBundle({
        stagingDir,
        destinationDir: diagnosticDir,
        operations: dependencies.publicationOperations,
        writeDiagnostic: async () => writeFile(resolve(stagingDir, "diagnostic.json"), `${JSON.stringify({ schema_version: 1, evaluation_id: id, status: "incomplete", ...diagnostic }, null, 2)}\n`),
      });
      return publication.status === "published"
        ? { status: "published", path: relativeRepoPath(workspace.repoRoot, resolve(diagnosticDir, "diagnostic.json")) }
        : publication;
    },
  });
  return outcome;
}
