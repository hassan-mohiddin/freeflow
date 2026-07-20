import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { loadDefinition, selectDefinition } from "./definitions.mjs";
import { createInvocationId, fileIdentity, writeJson, writeText } from "./evidence.mjs";
import { gradeDeterministic } from "./grade.mjs";
import { runBody, runDescription, VariantSetupError } from "./pi.mjs";
import { prepareFixture } from "./sandbox.mjs";

const VARIANTS = ["baseline", "candidate"];
const DESCRIPTION_TOOLS = new Set(["read"]);
const BODY_TOOLS = new Set(["read", "write", "edit"]);

/**
 * @param {string} definitionFile
 * @param {any} selectors
 * @param {{root?: string, signal?: AbortSignal}} options
 */
export async function runEvaluation(definitionFile, selectors = {}, { root = process.cwd(), signal } = {}) {
  const definitionPath = await realpath(path.resolve(root, definitionFile));
  const definition = await loadDefinition(definitionPath, { root });
  const selection = selectDefinition(definition, selectors);
  assertSupportedSelection(selection);
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

  const groups = [];
  for (const selected of selection.groups) {
    groups.push(await runGroup({ selected, root, resultDirectory, signal }));
  }
  const state = batchState(groups);
  const summary = {
    schema_version: 1,
    id: invocationId,
    state,
    definitionKind: selection.definitionKind,
    groups,
    completedAt: new Date().toISOString(),
  };
  await writeJson(path.join(resultDirectory, "summary.json"), summary);
  return { id: invocationId, path: resultDirectory, state, summary };
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
    if (group.tools.some((tool) => !supportedTools.has(tool))) {
      throw new Error(`${group.type} execution currently supports only ${[...supportedTools].join(", ")} tools`);
    }
  }
}

async function runGroup({ selected, root, resultDirectory, signal }) {
  const { group } = selected;
  const groupDirectory = path.join(resultDirectory, "groups", group.id);
  await mkdir(groupDirectory, { recursive: true });
  await writeJson(path.join(groupDirectory, "definition.json"), group);

  let fixture = null;
  let fixtureError = null;
  if (!signal?.aborted) {
    try {
      fixture = await prepareFixture({ declaredPath: group.fixture, root, groupDirectory });
    } catch (error) {
      fixtureError = error instanceof Error ? error.message : String(error);
    }
  }

  const runs = {};
  const runFiles = {};
  for (const variant of VARIANTS) {
    const variantDirectory = path.join(groupDirectory, variant);
    await mkdir(variantDirectory, { recursive: true });
    if (selected.variants[variant] === "not-selected") {
      runs[variant] = notSelectedRun(group, variant);
    } else if (signal?.aborted) {
      runs[variant] = cancelledRun(group, variant);
    } else if (fixtureError !== null) {
      runs[variant] = invalidRun(group, variant, fixtureError);
    } else {
      runs[variant] = await executeVariant({ group, variant, root, variantDirectory, fixture, signal });
    }
    const persisted = await persistRunOrFailure(variantDirectory, runs[variant]);
    runs[variant] = persisted.run;
    runFiles[variant] = persisted.file;
  }

  const evidence = {
    baseline: await fileIdentity(runFiles.baseline),
    candidate: await fileIdentity(runFiles.candidate),
  };
  const grade = await createGrade(group, runs, evidence);
  const persistedGrade = await persistGrade(groupDirectory, grade);
  const selectedRuns = VARIANTS.filter((variant) => selected.variants[variant] === "selected").map(
    (variant) => runs[variant],
  );
  const selectedState = selectedGroupState(selectedRuns, persistedGrade.grade);
  const groupState = selectedState === "cancelled" ? selectedState : fixtureError === null ? selectedState : "invalid";
  const groupResult = {
    id: group.id,
    position: selected.position,
    state: groupState,
    variants: Object.fromEntries(VARIANTS.map((variant) => [variant, runs[variant].state])),
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
  if (runs.every((run) => run.state === "complete") && grade.state !== "grade-error") return "complete";
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

async function executeVariant({ group, variant, root, variantDirectory, fixture, signal }) {
  try {
    const run = group.type === "body" ? runBody : runDescription;
    return await run({ group, variant, root, variantDirectory, fixture, signal });
  } catch (error) {
    if (error instanceof VariantSetupError) return invalidRun(group, variant, error.message);
    return infrastructureFailedRun(group, variant, error);
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
  await writeJson(runFile, {
    ...run,
    ...(Array.isArray(run.turns) ? { turns: externalizeTurnTranscripts(run.turns) } : {}),
    transcript: "transcript.json",
    artifacts: {
      events: hasProcessEvidence ? "events.jsonl" : null,
      final: "final.md",
      stderr: hasProcessEvidence ? "stderr.log" : null,
    },
  });
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
