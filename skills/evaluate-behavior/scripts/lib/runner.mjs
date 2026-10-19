import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { armNames } from "./arms.mjs";
import { budgetEvidence, charge, costEvidence, reserve, runBudgetEvidence } from "./budget.mjs";
import { COMMAND_TOOL, loadDefinition, selectDefinition } from "./definitions.mjs";
import { createInvocationId, fileIdentity, writeJson, writeText } from "./evidence.mjs";
import { gradeDeterministic } from "./grade.mjs";
import { prepareFreeflow } from "./freeflow.mjs";
import { postRunRecords } from "./hooks.mjs";
import { hostAdapter } from "./hosts/index.mjs";
import { identityRefusal, inputIdentity } from "./identity.mjs";
import { prepareSourceExtensions } from "./build-source.mjs";
import { armParticipants, runParticipants } from "./participants.mjs";
import { prepareShell } from "./shell.mjs";
import { enforceReferenceChecks } from "./reference.mjs";
import { createLimiter, withCpuSlot } from "./queue.mjs";
import { adoptRun, appendIndex, createReuse } from "./reuse.mjs";
import { prepareFixture, prepareRuntime, verifyDescriptionOnlyRevision } from "./sandbox.mjs";
import { applySourceOverrides } from "./source-override.mjs";
import { runBody, runDescription, VariantSetupError } from "./subject.mjs";
import { unclearedFlags } from "./scan.mjs";
import { armSealing } from "./seal.mjs";
import { applyValidityGate } from "./validity.mjs";

const DESCRIPTION_TOOLS = new Set(["read"]);
const BODY_TOOLS = new Set(["read", "write", "edit", "ls", "find", "grep"]);
// Native tools must be separated from extension tools before CLI tool selection is built.
const NATIVE_TOOLS = new Set(["read", "bash", "powershell", "edit", "write", "grep", "find", "ls"]);
const DEFAULT_RUNTIME = {
  session: false,
  prompt: "isolated",
  extensions: [],
  environment: { literal: {}, inherit: [] },
};

/** A group's host: its configuration's `host.name`, which every arm shares. Pi for groups resolved before it was recorded. */
export function groupHost(group) {
  return group.host ?? group.runtime?.host ?? "pi";
}

/** Where results are stored: `--results` when given, else `<root>/.skill-eval/runs`. */
export function resultsDirectory(root, results = null) {
  return results === null || results === undefined
    ? path.join(root, ".skill-eval", "runs")
    : path.resolve(root, results);
}

/** The reuse state for one run or aggregate (see reuse.mjs); `enabled` is `--reuse`. */
export function createRunReuse(runsDirectory, enabled) {
  return createReuse({
    resultsDirectory: runsDirectory,
    enabled,
    hostVersion: (host) => hostAdapter(host).version(),
  });
}

/**
 * Runs the selection once. Subjects run through `subjects` (a limiter shared by every invocation of one
 * aggregate; `jobs` at once); with one job, groups and arms run in order exactly as before. Cancellation
 * reaches running subjects; budget exhaustion only stops new ones from starting.
 *
 * @param {string} definitionFile
 * @param {any} selectors
 * @param {{root?: string, signal?: AbortSignal, budget?: any, dryRun?: boolean, jobs?: number, subjects?: ReturnType<typeof createLimiter>, results?: string | null, reuse?: any, groupRange?: [number, number] | null, loginsRefreshed?: boolean}} options
 */
export async function runEvaluation(definitionFile, selectors = {}, options = {}) {
  const { root = process.cwd(), signal, budget = null, dryRun = false, groupRange = null } = options;
  const { skipReferenceCheck = false } = options;
  const subjects = options.subjects ?? createLimiter(options.jobs ?? 1);
  const runsDirectory = resultsDirectory(root, options.results);
  const reuse = options.reuse ?? createRunReuse(runsDirectory, false);
  const definitionPath = await realpath(path.resolve(root, definitionFile));
  const definition = await loadDefinition(definitionPath, { root });
  const selection = selectDefinition(definition, selectors);
  // A pilot runs the first groups of the selection, and the batch after it the rest.
  if (groupRange !== null) selection.groups = selection.groups.slice(groupRange[0], groupRange[1]);
  // --source: an arm's Git source refs replaced for this run only, before anything reads them.
  const sources = options.sources && Object.keys(options.sources).length > 0 ? options.sources : null;
  applySourceOverrides(selection, sources);
  assertSupportedSelection(selection);

  // Canonical evidence needs every working-tree input recoverable from one commit; anything else is a dry run.
  const identity = await inputIdentity(root, workingTreeInputs(selection, definitionPath, root));
  const refusal = identityRefusal(identity);
  if (refusal !== null && !dryRun) throw new Error(refusal);
  const hostVersion = await checkHostVersion(selection);
  const hostExtensions = await resolveSelectedExtensions(selection);
  if (!options.loginsRefreshed) await refreshSelectedLogins(selection);
  const invocationId = createInvocationId();
  const resultDirectory = path.join(runsDirectory, invocationId);
  await mkdir(runsDirectory, { recursive: true });
  await mkdir(resultDirectory);
  await writeJson(path.join(resultDirectory, "invocation.json"), {
    schema_version: 1,
    id: invocationId,
    definition: definitionPath,
    results: runsDirectory,
    jobs: subjects.limit,
    reuse: reuse.enabled,
    ...(sources === null ? {} : { sources }),
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

  // A declared reference must solve its task before any subject starts (SPEC-002 A9).
  await enforceReferenceChecks(selection, { root, resultDirectory, skip: skipReferenceCheck, signal });

  // Budget exhaustion stops only subjects not yet started; a subject already running completes and is charged.
  const context = {
    root,
    invocationId,
    resultDirectory,
    signal,
    stopped: () => Boolean(signal?.aborted || budget?.exhausted),
    budget,
    subjects,
    // A clean working tree is identified by its commit, recorded on each working-tree source.
    sourceCommit: refusal === null ? identity.commit : null,
    reuse,
    dryRun,
    indexEntries: [],
    sources,
    // This invocation's own spend, apart from the run's shared budget, which every trial charges.
    cost: { spent: 0, subjects: 0, unmeasured: 0 },
  };
  const runOne = (selected) =>
    runGroup({ ...context, selected, hostExtensions: hostExtensions.get(selected.group.id) });
  const groups =
    subjects.limit === 1 ? await sequential(selection.groups, runOne) : await Promise.all(selection.groups.map(runOne));
  // Canonical complete runs become reusable, with or without --reuse; an index that cannot be written never fails
  // the run.
  if (!dryRun) await appendIndex(runsDirectory, context.indexEntries).catch(() => {});
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
  summary.cost = costEvidence(context.cost);
  // The budget is the whole run's, shared by every trial: its total is what the run had spent when this one ended.
  if (budget !== null) summary.budget = runBudgetEvidence(budget);
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

/** Each selected arm's declared host extensions, found among the host's installed packages before anything starts. */
async function resolveSelectedExtensions(selection) {
  const resolved = new Map();
  for (const { group, variants } of selection.groups) {
    const arms = Object.fromEntries(armNames(group).map((arm) => [arm, []]));
    for (const [arm, state] of Object.entries(variants)) {
      if (state === "selected") {
        arms[arm] = await hostAdapter(groupHost(group)).resolveExtensions(group.variants[arm].hostExtensions ?? [], {
          deferSources: true,
        });
      }
    }
    resolved.set(group.id, arms);
  }
  return resolved;
}

async function sequential(items, work) {
  const results = [];
  for (const item of items) results.push(await work(item));
  return results;
}

/**
 * Before a batch, makes every OAuth login the selected arms use valid for the target window, refreshing it
 * once, centrally, so no subject has to refresh its own copy. Trials call it once for all their invocations.
 */
export async function refreshSelectedLogins(selection) {
  const providers = new Map();
  for (const { group, variants } of selection.groups) {
    const host = groupHost(group);
    if (!providers.has(host)) providers.set(host, new Set());
    for (const [arm, state] of Object.entries(variants)) {
      const model = group.variants[arm].model?.model;
      if (state === "selected" && typeof model === "string" && model.includes("/")) {
        providers.get(host).add(model.split("/")[0]);
      }
    }
  }
  for (const [host, names] of providers) await hostAdapter(host).refreshLogins([...names]);
}

/**
 * A declared host version must match the installed host before anything starts. Returns the installed version of
 * the one host whose version was declared, or null when none was.
 */
async function checkHostVersion(selection) {
  const declared = new Map();
  for (const { group, variants } of selection.groups) {
    const host = groupHost(group);
    for (const [arm, state] of Object.entries(variants)) {
      const version = group.configurations?.[arm]?.host?.version;
      if (state !== "selected" || version === undefined) continue;
      if (!declared.has(host)) declared.set(host, new Set());
      declared.get(host).add(version);
    }
  }
  if (declared.size === 0) return null;
  const installed = {};
  for (const [host, versions] of declared) {
    installed[host] = await hostAdapter(host).version();
    for (const version of versions) {
      if (version !== installed[host]) {
        throw new Error(`the definition declares ${host} ${version}, but the installed ${host} is ${installed[host]}`);
      }
    }
  }
  // One host's version is a string, as it always was; a selection declaring versions for several hosts records each.
  const hosts = Object.keys(installed);
  return hosts.length === 1 ? installed[hosts[0]] : installed;
}

function assertSupportedSelection(selection) {
  for (const selected of selection.groups) {
    const { group } = selected;
    if (group.type !== "description" && group.type !== "body") {
      throw new Error("skill-eval run currently supports description and body groups only");
    }
    const supportedTools = new Set(group.type === "body" ? BODY_TOOLS : DESCRIPTION_TOOLS);
    // bash only through a declared, verified shell isolation (definitions.mjs and shell.mjs).
    if (group.type === "body" && Object.values(group.variants).every((variant) => variant.shell)) {
      supportedTools.add("bash");
    }
    const unsupportedNativeTools = group.tools.filter((tool) => NATIVE_TOOLS.has(tool) && !supportedTools.has(tool));
    if (unsupportedNativeTools.length > 0) {
      const hint = unsupportedNativeTools.includes("bash")
        ? "; bash runs only in a body group whose every arm declares a shell isolation (configuration.shell)"
        : "";
      throw new Error(
        `${group.type} execution does not support native tools: ${unsupportedNativeTools.join(", ")}${hint}`,
      );
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

export { budgetEvidence };

/**
 * One subject in a slot: it waits for a free slot, starts only if nothing stopped the run and the budget can
 * reserve for it, and is charged what it cost, to the run's budget and to this invocation's own `cost`. Returns
 * `{ run, executed }`.
 */
async function runSubject({ group, variant, stopped, budget, cost, subjects, execute }) {
  return subjects.run(async () => {
    if (stopped()) return { run: cancelledRun(group, variant), executed: false };
    const reservation = reserve(budget);
    if (reservation === null) return { run: cancelledRun(group, variant), executed: false };
    const run = await execute();
    const spent = run.usage?.cost?.total;
    charge(budget, reservation, spent ?? 0);
    cost.subjects += 1;
    if (typeof spent === "number" && Number.isFinite(spent)) cost.spent += spent;
    else cost.unmeasured += 1;
    return { run, executed: true };
  });
}

async function runGroup({
  selected,
  root,
  invocationId,
  resultDirectory,
  signal,
  stopped,
  budget,
  subjects,
  sourceCommit = null,
  hostExtensions = {},
  reuse,
  dryRun,
  indexEntries,
  sources = null,
  cost,
}) {
  const { group } = selected;
  const arms = armNames(group);
  const groupDirectory = path.join(resultDirectory, "groups", group.id);
  await mkdir(groupDirectory, { recursive: true });
  await writeJson(path.join(groupDirectory, "definition.json"), group);

  let fixture = null;
  let runtime = null;
  let freeflow = Object.fromEntries(arms.map((arm) => [arm, null]));
  let resourceError = null;
  let resourceDetails = null;
  let confinement = {};
  if (!stopped()) {
    try {
      fixture = await prepareFixture({ declaredPath: group.fixture, root, groupDirectory });
      runtime = await prepareRuntime({
        runtime: group.runtime ?? { host: groupHost(group), ...DEFAULT_RUNTIME },
        root,
        groupDirectory,
      });
      freeflow = await prepareFreeflow({ variants: group.variants, root, groupDirectory });
      // Building from source and probing the shell are local CPU work, so they wait for a --cpu-jobs slot.
      const extensions = hostExtensions;
      hostExtensions = await withCpuSlot(() => prepareSourceExtensions({ extensions, root, groupDirectory, signal }));
      const built = hostExtensions;
      confinement = await withCpuSlot(() =>
        prepareShell({ group, variants: selected.variants, hostExtensions: built, groupDirectory, signal }),
      );
      if (group.revision === "description-only") {
        await verifyDescriptionOnlyRevision({
          variants: group.variants,
          root,
          destinationRoot: path.join(groupDirectory, "resources", "description-only-check"),
        });
      }
    } catch (error) {
      resourceError = error instanceof Error ? error.message : String(error);
      resourceDetails = error?.details ?? null;
      if (resourceDetails?.confinement) confinement = resourceDetails.confinement;
    }
  }

  const runs = {};
  const runFiles = {};
  const keys = {};
  const reusedFrom = {};
  const runArm = async (variant) => {
    const variantDirectory = path.join(groupDirectory, variant);
    await mkdir(variantDirectory, { recursive: true });
    if (selected.variants[variant] === "not-selected") {
      runs[variant] = notSelectedRun(group, variant);
    } else if (stopped()) {
      runs[variant] = cancelledRun(group, variant);
    } else if (resourceError === null) {
      // A canonical run has a reuse key, and a new complete run is indexed under it with or without --reuse, so a
      // run made without it (a first run, a pilot on its own) can stand in later. Only --reuse claims an indexed run.
      keys[variant] = dryRun ? null : await reuse.keyFor(group, variant, root).catch(() => null);
      const claimed = await reuse.claim(keys[variant]);
      const adopted = claimed === null ? null : await adoptRun(claimed, variantDirectory).catch(() => null);
      if (adopted !== null) {
        runs[variant] = adopted;
        reusedFrom[variant] = adopted.reused;
      } else {
        const { run, executed } = await runSubject({
          group,
          variant,
          stopped,
          budget,
          cost,
          subjects,
          execute: () =>
            executeVariant({
              group,
              variant,
              root,
              variantDirectory,
              fixture,
              runtime,
              freeflow: freeflow[variant],
              hostExtensions: hostExtensions[variant] ?? [],
              signal,
            }),
        });
        runs[variant] = run;
        if (executed) {
          if (confinement[variant] !== undefined) run.confinement = confinement[variant];
          // What the subject's own code could reach: the network policy and where each path ran.
          run.sealing = armSealing(group, variant);
          if (sources?.[variant] !== undefined) run.sourceOverride = sources[variant];
          if (sourceCommit !== null && run.resources?.source?.kind === "working-tree") {
            run.resources.source.commit = sourceCommit;
          }
          // A run that shows no model at work is invalid before anything grades it; its graders then do not start.
          applyValidityGate(run);
          // Post-run hooks see the finished run before it is persisted; their records land in run.json.
          const records = await postRunRecords({ group, arm: variant, run, root, directory: variantDirectory, signal });
          if (records !== null) run.postRun = records;
        }
      }
    } else {
      runs[variant] = invalidRun(group, variant, resourceError);
      if (resourceDetails !== null) runs[variant].error.details = resourceDetails;
      if (confinement[variant] !== undefined) runs[variant].confinement = confinement[variant];
    }
    const persisted = await persistRunOrFailure(variantDirectory, runs[variant]);
    runs[variant] = persisted.run;
    runFiles[variant] = persisted.file;
  };
  if (subjects.limit === 1) await sequential(arms, runArm);
  else await Promise.all(arms.map(runArm));

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
  if (Object.keys(reusedFrom).length > 0) groupResult.reused = reusedFrom;
  // Why each invalid arm is invalid, so a pilot or a view can say it without opening the run.
  const invalid = Object.fromEntries(
    arms.filter((arm) => runs[arm].state === "invalid").map((arm) => [arm, runs[arm].error?.message ?? "invalid"]),
  );
  if (Object.keys(invalid).length > 0) groupResult.invalid = invalid;
  // Each arm's transcript-scan flags no person has cleared yet; such a run is held out of every claim.
  const flagged = {};
  for (const arm of arms) {
    const uncleared = await unclearedFlags(runs[arm], path.join(groupDirectory, arm));
    if (uncleared.length > 0) flagged[arm] = uncleared;
  }
  if (Object.keys(flagged).length > 0) groupResult.flagged = flagged;
  // A complete run with a readable grade is indexed for reuse; a reused run is not, so it is reused once.
  const gradeReadable =
    persistedGrade.artifact === "deterministic-grade.json" && persistedGrade.grade.state !== "grade-error";
  for (const arm of arms) {
    if (!gradeReadable || typeof keys[arm] !== "string" || runs[arm].state !== "complete" || runs[arm].reused) continue;
    indexEntries.push({
      key: keys[arm],
      result: invocationId,
      group: group.id,
      arm,
      indexedAt: new Date().toISOString(),
    });
  }
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
    const run =
      armParticipants(group, variant) !== null ? runParticipants : group.type === "body" ? runBody : runDescription;
    return await run({ group, variant, root, variantDirectory, fixture, runtime, freeflow, hostExtensions, signal });
  } catch (error) {
    if (error instanceof VariantSetupError) return invalidRun(group, variant, error.message);
    return infrastructureFailedRun(group, variant, error);
  } finally {
    await hostAdapter(groupHost(group)).removeCredentials(variantDirectory);
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
