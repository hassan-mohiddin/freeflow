import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, relative, resolve, sep } from "node:path";
import { CODEX_ADAPTER_VERSION, redactedCodexInvocation, runCodexSubject } from "./codex-adapter.mjs";
import { coordinateEvaluation } from "./coordinator.mjs";
import {
  createManifest,
  captureGitEvidenceNonMutating,
  copyDirectory,
  initializeFixtureGit,
  makeWritable,
  materializeCompositionVariant,
  materializeSkillVariant,
  removeWritableTree,
} from "./materialize.mjs";
import { hashDeclaredResources, hashDirectory, hashFile, sha256, stableJson } from "./hash.mjs";
import { gradeObjectiveRun } from "./grade.mjs";
import { verifyBundleIntegrity, writeBundleIntegrity } from "./integrity.mjs";
import { incompleteOperation } from "./outcome.mjs";
import {
  PI_ADAPTER_VERSION,
  PI_RPC_ADAPTER_VERSION,
  redactedInvocation,
  runPiRpcSubject,
  runPiSubject,
} from "./pi-adapter.mjs";
import {
  createStagingDirectory,
  publishDiagnostic as publishDiagnosticBundle,
  publishResult as publishResultBundle,
} from "./publication.mjs";
import { gradeSemanticRun } from "./semantic.mjs";
import { buildCompositionRuntimeContext, buildCompositionWorkflowEnvelope } from "../pi-composition-runtime.mjs";

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
  return (
    subject.process.code !== 0 ||
    subject.process.timed_out ||
    subject.process.output_limit_exceeded ||
    subject.process.transport_limit_exceeded ||
    subject.process.protocol_failed ||
    subject.process.aborted ||
    subject.runtime_counters.hard_turn_limit_reached ||
    subject.parsed.parse_errors.length > 0
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function validateCompositionSkillReads(composition, skillReads, role) {
  const expectedNames = [...composition.base_stack.map((component) => component.name), composition.target_name].sort();
  const actualNames = Object.keys(skillReads ?? {}).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames))
    throw new Error(`Composition activation evidence is missing or ambiguous for ${role}`);
}

export async function validateCompositionRuntimeImplementation(repoRoot, runtime, role) {
  for (const identity of Object.values(runtime.implementation_identity)) {
    const actual = await hashFile(identity.absolute_path ?? resolve(repoRoot, identity.path));
    if (actual !== identity.sha256)
      throw new Error(`Composition runtime implementation changed after approval for ${role}: ${identity.path}`);
  }
}

export function validateCompositionRuntimeEvidence(runtime, expected, records, expectedDeliveries, role) {
  if (!Array.isArray(records) || records.length !== expectedDeliveries)
    throw new Error(`Composition runtime delivery count is invalid for ${role}`);
  for (const [index, record] of records.entries()) {
    const first = index === 0;
    if (
      record.profile !== runtime.profile ||
      record.interaction_contract_sha256 !== runtime.interaction_contract_identity.sha256 ||
      record.workflow_sha256 !== runtime.workflow_identity.sha256 ||
      record.runtime_context_sha256 !== expected.runtime_context_sha256 ||
      !/^[a-f0-9]{64}$/.test(record.system_prompt_sha256 ?? "") ||
      record.workflow_custom_type !== "freeflow-workflow-bootstrap" ||
      record.workflow_delivered !== first ||
      record.workflow_delivery_reason !== (first ? "initial" : "suppressed-active-marker") ||
      record.workflow_envelope_sha256 !== (first ? expected.workflow_envelope_sha256 : null)
    ) {
      throw new Error(`Composition runtime delivery evidence does not match the approved profile for ${role}`);
    }
  }
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
  let snapshotRoot = resolve(runtimeRoot, "skill");
  const compositionRoot = resolve(runtimeRoot, "composition");
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
      if (copiedFixtureHash !== plan.summary.identities.fixture)
        throw new Error("Fixture changed after preflight approval");
    }
    await initializeFixtureGit(fixtureRoot);
    const beforeManifest = await createManifest(fixtureRoot);

    const assertWorkingSource = async (source, label) => {
      if (source.kind !== "working-tree") return;
      const currentSourceHash = await hashDeclaredResources(source.absolute_path, source.resources);
      if (currentSourceHash !== source.snapshot_hash)
        throw new Error(`${label} source changed after preflight for ${variant.role}`);
    };
    await assertWorkingSource(variant, "Subject");

    let skillSnapshots = null;
    let runtimeDelivery = null;
    let compositionHashesBefore = null;
    if (plan.composition) {
      for (const component of plan.composition.base_stack)
        await assertWorkingSource(component, `Composition ${component.name}`);
      if (plan.composition.runtime) await assertWorkingSource(plan.composition.runtime, "Composition runtime");
      const materialized = await materializeCompositionVariant(
        workspace.repoRoot,
        plan.composition,
        variant,
        compositionRoot,
      );
      skillSnapshots = materialized.skill_snapshots;
      snapshotRoot = skillSnapshots.find((item) => item.name === plan.composition.target_name).path;
      compositionHashesBefore = {};
      for (const snapshot of skillSnapshots) {
        const source =
          snapshot.name === plan.composition.target_name
            ? variant
            : plan.composition.base_stack.find((component) => component.name === snapshot.name);
        const hash = await hashDirectory(snapshot.path);
        if (hash !== source.snapshot_hash)
          throw new Error(`Materialized composition skill differs from approved resources: ${snapshot.name}`);
        compositionHashesBefore[snapshot.name] = hash;
      }
      if (materialized.runtime) {
        const hash = await hashDirectory(materialized.runtime.path);
        if (hash !== plan.composition.runtime.snapshot_hash)
          throw new Error("Materialized composition runtime differs from approved resources");
        compositionHashesBefore.runtime = hash;
        const interactionContractPath = resolve(materialized.runtime.path, materialized.runtime.interaction_contract);
        const workflowPath = resolve(materialized.runtime.path, materialized.runtime.workflow);
        const freeflowContext = {
          interactionContract: await readFile(interactionContractPath, "utf8"),
          workflowSkill: await readFile(workflowPath, "utf8"),
        };
        const expectedEnvelope = buildCompositionWorkflowEnvelope(freeflowContext.workflowSkill);
        runtimeDelivery = {
          extension: plan.composition.runtime.extension_path,
          environment: {
            FREEFLOW_EVAL_RUNTIME_INTERACTION_CONTRACT: interactionContractPath,
            FREEFLOW_EVAL_RUNTIME_WORKFLOW: workflowPath,
            FREEFLOW_EVAL_RUNTIME_EVIDENCE: resolve(configRoot, "composition-runtime-evidence.jsonl"),
          },
          expected: {
            runtime_context_sha256: sha256(buildCompositionRuntimeContext(freeflowContext)),
            workflow_envelope_sha256: sha256(stableJson(expectedEnvelope)),
          },
          materialized,
        };
        await validateCompositionRuntimeImplementation(workspace.repoRoot, plan.composition.runtime, variant.role);
      }
    } else {
      await materializeSkillVariant(workspace.repoRoot, variant, snapshotRoot);
    }
    const subjectHashBefore = await hashDirectory(snapshotRoot);
    if (subjectHashBefore !== variant.snapshot_hash)
      throw new Error(`Materialized subject differs from approved resources for ${variant.role}`);
    const skillManifest = await createManifest(snapshotRoot);

    const selectedHost = plan.plan_inputs.subject_host;
    const effectiveMode = plan.plan_inputs.effective_mode;
    if (selectedHost !== "none") {
      const rpcMode = effectiveMode === "rpc-scripted";
      const codexMode = selectedHost === "codex";
      const subjectRunner = codexMode
        ? dependencies.runCodexSubject
        : rpcMode
          ? dependencies.runRpcSubject
          : dependencies.runSubject;
      subject = await subjectRunner({
        prompt: plan.eval_case.prompt,
        turns: plan.eval_case.turns,
        provider: plan.plan_inputs.subject_model.provider,
        model: plan.plan_inputs.subject_model.model,
        thinking: plan.plan_inputs.subject_model.thinking,
        tools: plan.eval_case.execution.tools,
        skillName: workspace.suite.skill,
        skillSnapshot: plan.composition ? null : snapshotRoot,
        skillSnapshots,
        runtimeExtension: runtimeDelivery?.extension,
        runtimeEnvironment: runtimeDelivery?.environment,
        runtimeExpected: runtimeDelivery?.expected,
        workspace: fixtureRoot,
        configDir: configRoot,
        readRoots: [
          fixtureRoot,
          ...(skillSnapshots?.map((item) => item.path) ?? [snapshotRoot]),
          ...(runtimeDelivery ? [runtimeDelivery.materialized.runtime.path] : []),
        ],
        writeRoots: [fixtureRoot],
        timeoutMs: plan.plan_inputs.limits.timeout_ms,
        outputLimitBytes: plan.plan_inputs.limits.output_limit_bytes,
        transportLimitBytes: plan.plan_inputs.limits.transport_limit_bytes,
        maxTurns: plan.plan_inputs.limits.max_turns_per_process,
        maxUsd: plan.plan_inputs.max_usd,
        onTurnSettled: rpcMode
          ? async () => {
              const currentSubjectHash = await hashDirectory(snapshotRoot);
              if (currentSubjectHash !== subjectHashBefore)
                throw new Error(`Subject resources mutated during ${variant.role}`);
              const compositionHashes = {};
              if (skillSnapshots) {
                for (const snapshot of skillSnapshots) {
                  const hash = await hashDirectory(snapshot.path);
                  if (hash !== compositionHashesBefore[snapshot.name])
                    throw new Error(`Composition skill mutated during ${variant.role}: ${snapshot.name}`);
                  compositionHashes[snapshot.name] = hash;
                }
                if (runtimeDelivery) {
                  await validateCompositionRuntimeImplementation(
                    workspace.repoRoot,
                    plan.composition.runtime,
                    variant.role,
                  );
                  const hash = await hashDirectory(runtimeDelivery.materialized.runtime.path);
                  if (hash !== compositionHashesBefore.runtime)
                    throw new Error(`Composition runtime mutated during ${variant.role}`);
                  compositionHashes.runtime = hash;
                }
              }
              const manifest = await createManifest(fixtureRoot);
              const git = captureGitEvidenceNonMutating(fixtureRoot);
              return {
                manifest,
                changed_paths: git.changedPaths,
                diff: git.diff,
                git_status: git.status,
                subject_hash: currentSubjectHash,
                composition_hashes: skillSnapshots ? compositionHashes : null,
              };
            }
          : undefined,
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
          protocol_failed: subject.process.protocol_failed ?? false,
          aborted: subject.process.aborted ?? false,
          transport_bytes: subject.process.transport_bytes,
          retained_output_bytes: subject.process.retained_output_bytes,
          parse_errors: subject.parsed.parse_errors,
        },
      };
    }
    const subjectFailure = subject !== null && processFailed(subject);
    let runtimeEvidence = null;
    if (subject !== null && plan.composition)
      validateCompositionSkillReads(plan.composition, subject.parsed.skill_reads, variant.role);
    if (subject !== null && runtimeDelivery) {
      let raw;
      try {
        raw = await readFile(runtimeDelivery.environment.FREEFLOW_EVAL_RUNTIME_EVIDENCE, "utf8");
      } catch {
        throw new Error(`Composition runtime delivery evidence is missing for ${variant.role}`);
      }
      try {
        runtimeEvidence = raw
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      } catch {
        throw new Error(`Composition runtime delivery evidence is malformed for ${variant.role}`);
      }
      const expectedDeliveries = plan.plan_inputs.effective_mode === "rpc-scripted" ? plan.eval_case.turns.length : 1;
      validateCompositionRuntimeEvidence(
        plan.composition.runtime,
        runtimeDelivery.expected,
        runtimeEvidence,
        expectedDeliveries,
        variant.role,
      );
    }

    const subjectHashAfter = await hashDirectory(snapshotRoot);
    if (subjectHashBefore !== subjectHashAfter) throw new Error(`Subject resources mutated during ${variant.role}`);
    if (skillSnapshots) {
      for (const snapshot of skillSnapshots) {
        const hash = await hashDirectory(snapshot.path);
        if (hash !== compositionHashesBefore[snapshot.name])
          throw new Error(`Composition skill mutated during ${variant.role}: ${snapshot.name}`);
      }
      if (runtimeDelivery) {
        await validateCompositionRuntimeImplementation(workspace.repoRoot, plan.composition.runtime, variant.role);
        if ((await hashDirectory(runtimeDelivery.materialized.runtime.path)) !== compositionHashesBefore.runtime) {
          throw new Error(`Composition runtime mutated during ${variant.role}`);
        }
      }
    }
    const afterManifest = await createManifest(fixtureRoot);
    const git = captureGitEvidenceNonMutating(fixtureRoot);

    const counters = subject?.runtime_counters ?? {
      provider_requests: 0,
      turns_started: 0,
      tool_calls: 0,
      hard_turn_limit_reached: false,
    };
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
      composition: plan.summary.composition
        ? {
            skills: plan.summary.composition.skills,
            target_name: plan.summary.composition.target_name,
            runtime: plan.summary.composition.runtime_profile
              ? { profile: plan.summary.composition.runtime_profile }
              : null,
            identities: plan.summary.identities.composition,
            materialized_hashes: compositionHashesBefore,
            runtime_delivery: runtimeEvidence,
          }
        : null,
      host: selectedHost,
      adapter_version:
        selectedHost === "codex"
          ? CODEX_ADAPTER_VERSION
          : effectiveMode === "rpc-scripted"
            ? PI_RPC_ADAPTER_VERSION
            : PI_ADAPTER_VERSION,
      execution_mode: effectiveMode,
      scripted_turns: plan.eval_case.turns?.map(({ id }) => id) ?? null,
      provider: plan.plan_inputs.subject_model?.provider ?? null,
      model: plan.plan_inputs.subject_model?.model ?? null,
      thinking: plan.plan_inputs.subject_model?.thinking ?? null,
      tools: plan.eval_case.execution.tools,
      hard_limits: plan.plan_inputs.limits,
      invocation: subject
        ? selectedHost === "codex"
          ? redactedCodexInvocation(subject.invocation)
          : redactedInvocation(subject.invocation)
        : { command: null, args: [] },
      evidence_classes: { required: plan.summary.evidence.required, requested: plan.summary.evidence.requested },
      usage: subject?.parsed.usage ?? null,
      runtime_counters: counters,
      activation: {
        skill_read: subject?.parsed.skill_read ?? false,
        skill_reads:
          subject?.parsed.skill_reads ??
          (skillSnapshots ? Object.fromEntries(skillSnapshots.map((item) => [item.name, false])) : null),
      },
      changed_paths: git.changedPaths,
      assertion_root: selectedHost === "none" ? "skill" : "workspace",
      skill_manifest: skillManifest,
      process: subject
        ? {
            exit_code: subject.process.code,
            signal: subject.process.signal,
            timed_out: subject.process.timed_out,
            output_limit_exceeded: subject.process.output_limit_exceeded,
            transport_limit_exceeded: subject.process.transport_limit_exceeded,
            protocol_failed: subject.process.protocol_failed ?? false,
            aborted: subject.process.aborted ?? false,
            transport_bytes: subject.process.transport_bytes,
            retained_output_bytes: subject.process.retained_output_bytes,
            hard_turn_limit_reached: counters.hard_turn_limit_reached,
            parse_errors: subject.parsed.parse_errors,
          }
        : {
            exit_code: 0,
            signal: null,
            timed_out: false,
            output_limit_exceeded: false,
            transport_limit_exceeded: false,
            protocol_failed: false,
            aborted: false,
            transport_bytes: 0,
            retained_output_bytes: 0,
            hard_turn_limit_reached: false,
            parse_errors: [],
          },
    };
    if (dependencies.persistVariantEvidence) {
      await dependencies.persistVariantEvidence({
        evidenceDir,
        metadata,
        beforeManifest,
        afterManifest,
        subject,
        counters,
        git,
      });
    } else {
      await mkdir(resolve(evidenceDir, "inputs"), { recursive: true });
      await mkdir(resolve(evidenceDir, "artifacts"), { recursive: true });
      await writeFile(resolve(evidenceDir, "inputs", "case.json"), `${JSON.stringify(plan.eval_case, null, 2)}\n`);
      await copyWithoutGit(snapshotRoot, resolve(evidenceDir, "inputs", "skill"));
      if (skillSnapshots) await copyWithoutGit(compositionRoot, resolve(evidenceDir, "inputs", "composition"));
      await copyWithoutGit(fixtureRoot, resolve(evidenceDir, "artifacts", "workspace"));
      await Promise.all([
        writeFile(resolve(evidenceDir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`),
        writeFile(resolve(evidenceDir, "before-manifest.json"), `${JSON.stringify(beforeManifest, null, 2)}\n`),
        writeFile(resolve(evidenceDir, "after-manifest.json"), `${JSON.stringify(afterManifest, null, 2)}\n`),
        writeFile(resolve(evidenceDir, "final.md"), subject?.parsed.final_text ?? ""),
        writeFile(resolve(evidenceDir, "events.jsonl"), subject?.process.stdout ?? ""),
        writeFile(
          resolve(evidenceDir, "tool-events.json"),
          `${JSON.stringify(subject?.parsed.tool_events ?? [], null, 2)}\n`,
        ),
        writeFile(resolve(evidenceDir, "runtime-counters.json"), `${JSON.stringify(counters, null, 2)}\n`),
        writeFile(resolve(evidenceDir, "stderr.log"), subject?.process.stderr ?? ""),
        writeFile(resolve(evidenceDir, "diff"), git.diff),
        writeFile(resolve(evidenceDir, "git-status.txt"), git.status),
        writeFile(resolve(evidenceDir, "exit-status.txt"), `${subject?.process.code ?? 0}\n`),
        writeFile(resolve(evidenceDir, "usage.json"), `${JSON.stringify(subject?.parsed.usage ?? null, null, 2)}\n`),
        ...(effectiveMode === "rpc-scripted"
          ? [
              writeFile(
                resolve(evidenceDir, "transcript.json"),
                `${JSON.stringify({ schema_version: 1, turns: subject?.parsed.turns ?? [] }, null, 2)}\n`,
              ),
            ]
          : []),
      ]);
      if (runtimeDelivery) {
        await cp(
          runtimeDelivery.environment.FREEFLOW_EVAL_RUNTIME_EVIDENCE,
          resolve(evidenceDir, "runtime-delivery.jsonl"),
        ).catch(() => {});
      }
    }
    if (subjectFailure)
      throw new Error(`Subject ${variant.role} produced unusable evidence or exited with ${subject.process.code}`);
    const objective = await gradeObjectiveRun(evidenceDir);
    await writeFile(resolve(evidenceDir, "objective-grade.json"), `${JSON.stringify(objective, null, 2)}\n`);
    value = {
      evidence_dir: evidenceDir,
      metadata,
      objective,
      assertions: assertionVerdicts(objective, null),
      semantic_assertion_ids: objective.assertions
        .filter((assertion) => assertion.state === "pending-semantic")
        .map((assertion) => assertion.id),
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
    ...variants.map(
      (variant) => `- ${variant.role}: ${variant.assertions.map((item) => `${item.id}=${item.verdict}`).join(", ")}`,
    ),
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
  const runRpcSubject = dependencies.runRpcSubject ?? runPiRpcSubject;
  const runCodex = dependencies.runCodexSubject ?? runCodexSubject;
  const gradeSemantic = dependencies.gradeSemantic ?? gradeSemanticRun;
  const id = evaluationId(plan);
  const runsRoot = resolve(workspace.skillRoot, "runs");
  const stagingDir = resolve(runsRoot, `.staging-${id}`);
  const finalDir = resolve(runsRoot, "evaluations", id);
  const diagnosticDir = resolve(runsRoot, "diagnostics", id);
  await mkdir(runsRoot, { recursive: true });
  const staging = await createStagingDirectory(stagingDir, dependencies.publicationOperations);
  if (staging.status === "incomplete") {
    return {
      status: "incomplete",
      failure: staging.failure,
      usage: { turns: 0, provider_requests: 0, tool_calls: 0, tokens: null, cost_usd: null },
      limitations: plan.summary.limitations,
    };
  }
  try {
    await writeFile(
      resolve(stagingDir, "plan.json"),
      `${JSON.stringify({ schema_version: 1, ...plan.summary }, null, 2)}\n`,
    );
  } catch (error) {
    return {
      status: "incomplete",
      failure: { primary: errorMessage(error), secondary: null },
      usage: { turns: 0, provider_requests: 0, tool_calls: 0, tokens: null, cost_usd: null },
      limitations: plan.summary.limitations,
    };
  }

  const coordinatorPlan = {
    fingerprint: plan.fingerprint,
    skill: workspace.suite.skill,
    case_id: plan.eval_case.id,
    evaluation_kind: plan.eval_case.evaluation_kind,
    model_driven: plan.plan_inputs.subject_host !== "none",
    max_usd: plan.plan_inputs.max_usd,
    evidence_support: plan.summary.evidence,
    limitations: plan.summary.limitations,
    variants: plan.variants.map(({ id: variantId, role }) => ({ id: variantId, role })),
  };
  const variantByRole = new Map(plan.variants.map((variant) => [variant.role, variant]));

  const outcome = await coordinateEvaluation(coordinatorPlan, {
    runSubject: async ({ role }) =>
      executeVariant(workspace, plan, variantByRole.get(role), resolve(stagingDir, "evidence", role), id, {
        runSubject,
        runRpcSubject,
        runCodexSubject: runCodex,
        persistVariantEvidence: dependencies.persistVariantEvidence,
        cleanupRuntime: dependencies.cleanupRuntime,
      }),
    runSemantic: async ({ role }, _subject, semanticContext) => {
      const semantic = await gradeSemantic(resolve(stagingDir, "evidence", role), {
        provider: plan.plan_inputs.grader_model.provider,
        model: plan.plan_inputs.grader_model.model,
        thinking: plan.plan_inputs.grader_model.thinking,
        max_turns_per_process: plan.plan_inputs.limits.max_turns_per_process,
        timeout_ms: plan.plan_inputs.limits.timeout_ms,
        output_limit_bytes: plan.plan_inputs.limits.output_limit_bytes,
        transport_limit_bytes: plan.plan_inputs.limits.transport_limit_bytes,
        diagnostic: semanticContext.diagnostic,
      });
      const execution = semantic.execution
        ? {
            id: `semantic-${role}`,
            kind: "semantic",
            role,
            ...semantic.execution,
            process: semantic.execution.process ?? {
              exit_code: 1,
              signal: null,
              timed_out: false,
              output_limit_exceeded: false,
              parse_errors: [],
            },
          }
        : null;
      if (semantic.status === "incomplete")
        return incompleteOperation({
          execution,
          primary: semantic.failure.primary,
          secondary: semantic.failure.secondary ?? semantic.failure.cleanup ?? null,
        });
      const grade = semantic.grade;
      return {
        status: "complete",
        execution,
        value: {
          assertions: grade.assertions.map((assertion) => ({
            ...assertion,
            verdict: assertion.verdict === "uncertain" ? "inconclusive" : assertion.verdict,
          })),
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
        semantic: variant.semantic
          ? {
              ...variant.semantic.grade,
              diagnostic: variant.semantic.diagnostic,
              promotable: variant.semantic.promotable,
            }
          : null,
        assertions: variant.assertions,
      }));
      const candidate = variants.find((variant) => variant.role === "candidate" || variant.role === "subject");
      const residualUncertainty = variants.flatMap((variant) => [
        ...variant.assertions
          .filter((assertion) => assertion.verdict === "inconclusive")
          .map((assertion) => `${variant.role}:${assertion.id}`),
        ...(variant.semantic?.uncertainty ? [`${variant.role}: ${variant.semantic.uncertainty}`] : []),
      ]);
      const unavailable = [
        ...(coordinated.usage.provider_requests === null ? ["usage.provider_requests"] : []),
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
        unsupported_claims: Object.entries(plan.summary.evidence.requested)
          .filter(([, state]) => state === "unsupported")
          .map(([name]) => name),
        usage: coordinated.usage,
        unavailable,
        limitations: plan.summary.limitations,
        residual_uncertainty: residualUncertainty,
        readiness: {
          required_for_bootstrap: plan.eval_case.required_for_bootstrap,
          candidate_assertions_pass: candidate.assertions.every((assertion) => assertion.verdict === "pass"),
        },
      };
      const publication = await publishResultBundle({
        stagingDir,
        destinationDir: finalDir,
        operations: dependencies.publicationOperations,
        prepare: async () => {
          await writeFile(resolve(stagingDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
          await writeFile(
            resolve(stagingDir, "report.md"),
            renderReport(plan, coordinated.decision, variants, coordinated.usage, plan.summary.limitations),
          );
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
        writeDiagnostic: async () =>
          writeFile(
            resolve(stagingDir, "diagnostic.json"),
            `${JSON.stringify({ schema_version: 1, evaluation_id: id, status: "incomplete", ...diagnostic }, null, 2)}\n`,
          ),
      });
      return publication.status === "published"
        ? { status: "published", path: relativeRepoPath(workspace.repoRoot, resolve(diagnosticDir, "diagnostic.json")) }
        : publication;
    },
  });
  return outcome;
}
