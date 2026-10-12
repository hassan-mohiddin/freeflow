import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { armNames } from "./arms.mjs";
import { COMMAND_TOOL, loadDefinition, selectDefinition } from "./definitions.mjs";
import { createInvocationId, fileIdentity, writeJson, writeText } from "./evidence.mjs";
import { gradeDeterministic } from "./grade.mjs";
import { prepareFreeflow } from "./freeflow.mjs";
import { postRunRecords } from "./hooks.mjs";
import { identityRefusal, inputIdentity, installedHostVersion } from "./identity.mjs";
import { removeCopiedCredentials, TARGET_MINUTES } from "./isolation.mjs";
import { ensureLogin, resolveHostExtensions } from "./pi-host.mjs";
import { baseProcessEnvironment, runBody, runDescription, VariantSetupError } from "./pi.mjs";
import { prepareFixture, prepareRuntime, verifyDescriptionOnlyRevision } from "./sandbox.mjs";

const DESCRIPTION_TOOLS = new Set(["read"]);
const BODY_TOOLS = new Set(["read", "write", "edit", "ls", "find", "grep"]);
// Native tools must be separated from extension tools before CLI tool selection is built.
const NATIVE_TOOLS = new Set(["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"]);
const DEFAULT_RUNTIME = {
  host: "pi",
  session: false,
  prompt: "isolated",
  extensions: [],
  environment: { literal: {}, inherit: [] },
};

/**
 * @param {string} definitionFile
 * @param {any} selectors
 * @param {{root?: string, signal?: AbortSignal, budget?: {maxCost: number, spent: number, exhausted: boolean} | null}} options
 */
export async function runEvaluation(
  definitionFile,
  selectors = {},
  { root = process.cwd(), signal, budget = null, dryRun = false } = {},
) {
  const definitionPath = await realpath(path.resolve(root, definitionFile));
  const definition = await loadDefinition(definitionPath, { root });
  const selection = selectDefinition(definition, selectors);
  assertSupportedSelection(selection);

  // Canonical evidence needs every working-tree input recoverable from one commit; anything else is a dry run.
  const identity = await inputIdentity(root, workingTreeInputs(selection, definitionPath, root));
  const refusal = identityRefusal(identity);
  if (refusal !== null && !dryRun) throw new Error(refusal);
  const hostVersion = await checkHostVersion(selection);
  const hostExtensions = await resolveSelectedExtensions(selection);
  await refreshSelectedLogins(selection);
  const invocationId = createInvocationId();
  const runsDirectory = path.join(root, ".skill-eval", "runs");
  const resultDirectory = path.join(runsDirectory, invocationId);
  await mkdir(runsDirectory, { recursive: true });
  await mkdir(resultDirectory);
  await writeJson(path.join(resultDirectory, "invocation.json"), {
    schema_version: 1,
    id: invocationId,
    definition: definitionPath,
    selection: {
      group: selectors.group ?? null,
      variant: selectors.variant ?? null,
      groups: selection.groups.map((entry) => ({
        id: entry.group.id,
        position: entry.position,
        variants: entry.variants,
      })),
    },
    startedAt: new Date().toISOString(),
  });

  // Budget exhaustion cancels only queued subjects; a subject already running completes and is charged.
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onParentAbort, { once: true });
  const charge = (run) => {
    if (budget === null) return;
    budget.spent += run.usage?.cost?.total ?? 0;
    if (budget.spent >= budget.maxCost) {
      budget.exhausted = true;
      controller.abort();
    }
  };

  const groups = [];
  try {
    // A clean working tree is identified by its commit, recorded on each working-tree source.
    const sourceCommit = refusal === null ? identity.commit : null;
    for (const selected of selection.groups) {
      groups.push(
        await runGroup({
          selected,
          root,
          resultDirectory,
          signal: controller.signal,
          charge,
          sourceCommit,
          hostExtensions: hostExtensions.get(selected.group.id),
        }),
      );
    }
  } finally {
    signal?.removeEventListener("abort", onParentAbort);
  }
  const state = batchState(groups);
  const summary = {
    schema_version: 1,
    id: invocationId,
    state,
    definitionKind: selection.definitionKind,
    dryRun,
    inputs: identity.repository
      ? { commit: identity.commit, uncommitted: identity.uncommitted }
      : { commit: null, uncommitted: [], repository: false },
    groups,
    completedAt: new Date().toISOString(),
  };
  if (hostVersion !== null) summary.hostVersion = hostVersion;
  if (budget !== null) summary.budget = budgetEvidence(budget);
  await writeJson(path.join(resultDirectory, "summary.json"), summary);
  return { id: invocationId, path: resultDirectory, state, summary };
}

/** Every path a run reads from the working tree: definition files, fixtures, runtime bundles, working-tree subjects. */
function workingTreeInputs(selection, definitionPath, root) {
  const inputs = new Set([definitionPath]);
  for (const { group, variants } of selection.groups) {
    for (const file of group.files ?? []) inputs.add(file);
    if (group.fixture !== null) inputs.add(path.resolve(root, group.fixture));
    for (const bundle of group.runtime?.extensions ?? []) {
      for (const resource of bundle.resources) inputs.add(path.resolve(root, resource));
    }
    for (const [arm, state] of Object.entries(variants)) {
      const variant = group.variants[arm];
      if (state !== "selected" || variant.source.kind !== "working-tree") continue;
      for (const entry of [...variant.skills, ...variant.context]) inputs.add(path.resolve(root, entry));
    }
  }
  return [...inputs];
}

/** Each selected arm's declared host extensions, found among the installed Pi packages before anything starts. */
async function resolveSelectedExtensions(selection) {
  const resolved = new Map();
  for (const { group, variants } of selection.groups) {
    const arms = Object.fromEntries(armNames(group).map((arm) => [arm, []]));
    for (const [arm, state] of Object.entries(variants)) {
      if (state === "selected") arms[arm] = await resolveHostExtensions(group.variants[arm].hostExtensions ?? []);
    }
    resolved.set(group.id, arms);
  }
  return resolved;
}

/**
 * Before a batch, makes every OAuth login the selected arms use valid for the target window, refreshing it
 * once, centrally, so no subject has to refresh its own copy.
 */
async function refreshSelectedLogins(selection) {
  const providers = new Set();
  for (const { group, variants } of selection.groups) {
    for (const [arm, state] of Object.entries(variants)) {
      const model = group.variants[arm].model?.model;
      if (state === "selected" && typeof model === "string" && model.includes("/")) providers.add(model.split("/")[0]);
    }
  }
  for (const provider of providers) await ensureLogin(provider, { threshold: TARGET_MINUTES, target: TARGET_MINUTES });
}

/** A declared host version must match the installed host before anything starts. */
async function checkHostVersion(selection) {
  const declared = new Set();
  for (const { group, variants } of selection.groups) {
    for (const [arm, state] of Object.entries(variants)) {
      const version = group.configurations?.[arm]?.host?.version;
      if (state === "selected" && version !== undefined) declared.add(version);
    }
  }
  if (declared.size === 0) return null;
  const installed = await installedHostVersion("pi", baseProcessEnvironment());
  for (const version of declared) {
    if (version !== installed) {
      throw new Error(`the definition declares pi ${version}, but the installed pi is ${installed}`);
    }
  }
  return installed;
}

function assertSupportedSelection(selection) {
  for (const selected of selection.groups) {
    const { group } = selected;
    if (group.type !== "description" && group.type !== "body") {
      throw new Error("skill-eval run currently supports description and body groups only");
    }
    if (group.expectations.some((expectation) => expectation.kind === "command")) {
      throw new Error("command expectations are not supported");
    }
    const supportedTools = group.type === "body" ? BODY_TOOLS : DESCRIPTION_TOOLS;
    const unsupportedNativeTools = group.tools.filter((tool) => NATIVE_TOOLS.has(tool) && !supportedTools.has(tool));
    if (unsupportedNativeTools.length > 0) {
      throw new Error(`${group.type} execution does not support native tools: ${unsupportedNativeTools.join(", ")}`);
    }
    // The evaluator supplies run_command itself when the definition declares commands.
    const customTools = group.tools.filter(
      (tool) => !NATIVE_TOOLS.has(tool) && !supportedTools.has(tool) && tool !== COMMAND_TOOL,
    );
    if (group.type === "description" && customTools.length > 0) {
      throw new Error(`${group.type} execution does not support custom tools: ${customTools.join(", ")}`);
    }
    // Freeflow registers its own tools, so a Freeflow configuration also allows custom tool names.
    const freeflowLoaded = Object.values(group.variants).some((variant) => variant.freeflow);
    if (customTools.length > 0 && (group.runtime?.extensions?.length ?? 0) === 0 && !freeflowLoaded) {
      throw new Error(
        `${group.type} execution requires declared extensions for custom tools: ${customTools.join(", ")}`,
      );
    }
  }
}

export function budgetEvidence(budget) {
  return { maxCost: budget.maxCost, spent: Number(budget.spent.toFixed(10)), exhausted: budget.exhausted };
}

async function runGroup({ selected, root, resultDirectory, signal, charge, sourceCommit = null, hostExtensions = {} }) {
  const { group } = selected;
  const arms = armNames(group);
  const groupDirectory = path.join(resultDirectory, "groups", group.id);
  await mkdir(groupDirectory, { recursive: true });
  await writeJson(path.join(groupDirectory, "definition.json"), group);

  let fixture = null;
  let runtime = null;
  let freeflow = Object.fromEntries(arms.map((arm) => [arm, null]));
  let resourceError = null;
  if (!signal?.aborted) {
    try {
      fixture = await prepareFixture({ declaredPath: group.fixture, root, groupDirectory });
      runtime = await prepareRuntime({
        runtime: group.runtime ?? DEFAULT_RUNTIME,
        root,
        groupDirectory,
      });
      freeflow = await prepareFreeflow({ variants: group.variants, root, groupDirectory });
      if (group.revision === "description-only") {
        await verifyDescriptionOnlyRevision({
          variants: group.variants,
          root,
          destinationRoot: path.join(groupDirectory, "resources", "description-only-check"),
        });
      }
    } catch (error) {
      resourceError = error instanceof Error ? error.message : String(error);
    }
  }

  const runs = {};
  const runFiles = {};
  for (const variant of arms) {
    const variantDirectory = path.join(groupDirectory, variant);
    await mkdir(variantDirectory, { recursive: true });
    if (selected.variants[variant] === "not-selected") {
      runs[variant] = notSelectedRun(group, variant);
    } else if (signal?.aborted) {
      runs[variant] = cancelledRun(group, variant);
    } else if (resourceError === null) {
      runs[variant] = await executeVariant({
        group,
        variant,
        root,
        variantDirectory,
        fixture,
        runtime,
        freeflow: freeflow[variant],
        hostExtensions: hostExtensions[variant] ?? [],
        signal,
      });
      charge(runs[variant]);
      if (sourceCommit !== null && runs[variant].resources?.source?.kind === "working-tree") {
        runs[variant].resources.source.commit = sourceCommit;
      }
      // Post-run hooks see the finished run before it is persisted; their records land in run.json.
      const records = await postRunRecords({
        group,
        arm: variant,
        run: runs[variant],
        root,
        directory: variantDirectory,
        signal,
      });
      if (records !== null) runs[variant].postRun = records;
    } else {
      runs[variant] = invalidRun(group, variant, resourceError);
    }
    const persisted = await persistRunOrFailure(variantDirectory, runs[variant]);
    runs[variant] = persisted.run;
    runFiles[variant] = persisted.file;
  }

  const evidence = {};
  for (const arm of arms) evidence[arm] = await runFileIdentity(runFiles[arm]);
  const grade = await createGrade(group, runs, evidence);
  const persistedGrade = await persistGrade(groupDirectory, grade);
  const selectedRuns = arms
    .filter((variant) => selected.variants[variant] === "selected")
    .map((variant) => runs[variant]);
  const selectedState = selectedGroupState(selectedRuns, persistedGrade.grade);
  let groupState = selectedState;
  if (selectedState !== "cancelled" && resourceError !== null) groupState = "invalid";
  const groupResult = {
    id: group.id,
    position: selected.position,
    state: groupState,
    variants: Object.fromEntries(arms.map((variant) => [variant, runs[variant].state])),
    grade: persistedGrade.grade.state,
    artifacts: { grade: persistedGrade.artifact, group: "group.json" },
    errors: persistedGrade.errors,
  };
  return persistGroupResult(groupDirectory, groupResult);
}

function batchState(groups) {
  if (groups.some((group) => group.state === "cancelled")) return "cancelled";
  if (groups.every((group) => group.state === "complete")) return "complete";
  return "partially-complete";
}

function selectedGroupState(runs, grade) {
  if (runs.some((run) => run.state === "cancelled")) return "cancelled";
  // A grade whose every selected check is unavailable observed nothing, so the group is not complete.
  if (runs.every((run) => run.state === "complete") && grade.state === "complete") return "complete";
  return "partially-complete";
}

async function createGrade(group, runs, evidence) {
  try {
    return await gradeDeterministic(group, runs, evidence);
  } catch (error) {
    return gradeErrorReport(evidence, `deterministic grading failed: ${errorMessage(error)}`);
  }
}

async function persistGrade(groupDirectory, grade) {
  const artifact = "deterministic-grade.json";
  try {
    await writeJson(path.join(groupDirectory, artifact), grade);
    return { grade, artifact, errors: [] };
  } catch (error) {
    const reason = `failed to persist ${artifact}: ${errorMessage(error)}`;
    const failed = gradeErrorReport(grade.evidence, reason, grade);
    const fallback = "deterministic-grade-error.json";
    await writeJson(path.join(groupDirectory, fallback), failed);
    return {
      grade: failed,
      artifact: fallback,
      errors: [{ kind: "persistence", artifact, message: reason }],
    };
  }
}

async function persistGroupResult(groupDirectory, groupResult) {
  const artifact = "group.json";
  try {
    await writeJson(path.join(groupDirectory, artifact), groupResult);
    return groupResult;
  } catch (error) {
    const message = `failed to persist ${artifact}: ${errorMessage(error)}`;
    const fallback = "group-error.json";
    const failed = {
      ...groupResult,
      state: groupResult.state === "complete" ? "partially-complete" : groupResult.state,
      artifacts: { ...groupResult.artifacts, group: fallback },
      errors: [...groupResult.errors, { kind: "persistence", artifact, message }],
    };
    await writeJson(path.join(groupDirectory, fallback), failed);
    return failed;
  }
}

function gradeErrorReport(evidence, reason, grade = null) {
  return {
    schema_version: 1,
    state: "grade-error",
    evidence,
    checks: grade?.checks ?? [],
    comparisons: grade?.comparisons ?? [],
    errors: [...(grade?.errors ?? []), { id: null, reason }],
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function executeVariant({
  group,
  variant,
  root,
  variantDirectory,
  fixture,
  runtime,
  freeflow,
  hostExtensions,
  signal,
}) {
  try {
    const run = group.type === "body" ? runBody : runDescription;
    return await run({ group, variant, root, variantDirectory, fixture, runtime, freeflow, hostExtensions, signal });
  } catch (error) {
    if (error instanceof VariantSetupError) return invalidRun(group, variant, error.message);
    return infrastructureFailedRun(group, variant, error);
  } finally {
    await removeCopiedCredentials(variantDirectory);
  }
}

async function persistRunOrFailure(variantDirectory, run) {
  try {
    return { run, file: await persistRun(variantDirectory, run) };
  } catch (error) {
    const failed = persistenceFailedRun(run, error);
    const runFile = path.join(variantDirectory, "run.json");
    await writeJson(runFile, {
      ...failed,
      transcript: failed.transcript ?? [],
      artifacts: {
        events: failed.process === undefined ? null : "events.jsonl",
        final: null,
        stderr: failed.process === undefined ? null : "stderr.log",
      },
    });
    return { run: failed, file: runFile };
  }
}

async function persistRun(variantDirectory, run) {
  const transcript = run.transcript ?? [];
  const response = run.response ?? "";
  await writeJson(path.join(variantDirectory, "transcript.json"), transcript);
  await writeText(path.join(variantDirectory, "final.md"), response === "" ? "" : `${response}\n`);
  const runFile = path.join(variantDirectory, "run.json");
  const hasProcessEvidence = run.process !== undefined;
  const persisted = {
    ...run,
    transcript: "transcript.json",
    artifacts: {
      events: hasProcessEvidence ? "events.jsonl" : null,
      final: "final.md",
      stderr: hasProcessEvidence ? "stderr.log" : null,
      context: run.contextObservationArtifact ? "context-observations.jsonl" : null,
    },
  };
  if (Array.isArray(run.turns)) persisted.turns = externalizeTurnTranscripts(run.turns);
  await writeJson(runFile, persisted);
  return runFile;
}

function externalizeTurnTranscripts(turns) {
  let offset = 0;
  return turns.map((turn) => {
    const length = Array.isArray(turn.transcript) ? turn.transcript.length : 0;
    const transcript = { file: "transcript.json", start: offset, end: offset + length };
    offset += length;
    return { ...turn, transcript };
  });
}

function notSelectedRun(group, variant) {
  return {
    schema_version: 1,
    variant,
    state: "not-selected",
    evaluationType: group.type,
    prompt: group.input.prompt ?? null,
    prompts: group.input.turns ?? null,
    activation: unavailableActivation(),
    response: "",
    transcript: [],
    error: null,
  };
}

function cancelledRun(group, variant) {
  return {
    schema_version: 1,
    variant,
    state: "cancelled",
    evaluationType: group.type,
    prompt: group.input.prompt ?? null,
    prompts: group.input.turns ?? null,
    activation: unavailableActivation(),
    response: "",
    transcript: [],
    error: { kind: "cancellation", message: "Cancelled before subject execution" },
  };
}

function invalidRun(group, variant, message) {
  return {
    schema_version: 1,
    variant,
    state: "invalid",
    evaluationType: group.type,
    prompt: group.input.prompt ?? null,
    prompts: group.input.turns ?? null,
    activation: unavailableActivation(),
    response: "",
    transcript: [],
    error: { kind: "setup", message },
  };
}

function persistenceFailedRun(run, error) {
  return {
    ...run,
    state: "infrastructure-failed",
    error: {
      kind: "persistence",
      message: error instanceof Error ? error.message : String(error),
      cause: run.error ?? null,
    },
  };
}

function infrastructureFailedRun(group, variant, error) {
  return {
    schema_version: 1,
    variant,
    state: "infrastructure-failed",
    evaluationType: group.type,
    prompt: group.input.prompt ?? null,
    prompts: group.input.turns ?? null,
    activation: unavailableActivation(),
    response: "",
    transcript: [],
    error: { kind: "infrastructure", message: error instanceof Error ? error.message : String(error) },
  };
}

function unavailableActivation() {
  return {
    targetRead: null,
    firstReadTurn: null,
    readTurns: [],
    successfulReadPaths: [],
  };
}

// An unreadable run file leaves its identity unavailable instead of escaping the whole invocation.
async function runFileIdentity(file) {
  try {
    return await fileIdentity(file);
  } catch (error) {
    return { path: file, sha256: null, error: errorMessage(error) };
  }
}
