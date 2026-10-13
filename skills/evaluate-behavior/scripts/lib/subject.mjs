// One subject: the host-neutral part of running an arm's agent. It materializes the declared environment, fixture,
// runtime and Freeflow settings, asks the arm's host adapter (hosts/) to launch the agent, and turns what the host
// observed into the arm's run record. Everything that depends on the host program lives in its adapter.

import { createHash } from "node:crypto";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { baseProcessEnvironment } from "./process.mjs";
import { writeFreeflowSettings } from "./freeflow.mjs";
import { runMetrics } from "./hooks.mjs";
import { hostAdapter } from "./hosts/index.mjs";
import {
  fingerprintDirectory,
  materializeEnvironment,
  materializeFixture,
  materializeRuntime,
  snapshotWorkspace,
  verifyEnvironment,
  verifyRuntime,
  workspaceChanges,
} from "./sandbox.mjs";

const TURN_WORKSPACE_KINDS = new Set(["path", "changed-paths", "file-text", "json"]);

export class VariantSetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "VariantSetupError";
  }
}

export async function runDescription({
  group,
  variant,
  root,
  variantDirectory,
  fixture,
  runtime,
  freeflow,
  hostExtensions,
  signal,
  extendEnvironment = null,
}) {
  const options = { group, variant, root, variantDirectory, fixture, runtime, freeflow, hostExtensions, signal };
  options.extendEnvironment = extendEnvironment;
  if (group.input.turns !== undefined) return runPersistentDescription(options);
  return runOneShotDescription(options);
}

export async function runBody({
  group,
  variant,
  root,
  variantDirectory,
  fixture,
  runtime,
  freeflow,
  hostExtensions,
  signal,
  extendEnvironment = null,
  nextPrompt = null,
}) {
  const options = { group, variant, root, variantDirectory, fixture, runtime, freeflow, hostExtensions, signal };
  options.extendEnvironment = extendEnvironment;
  const subject = await prepareSubject(options, "rpc");
  const before = await fingerprintDirectory(subject.workspace);
  const declaredPrompts = group.input.prompt === undefined ? [...group.input.turns] : [group.input.prompt];
  // A container environment runs the subject's bash and declared commands in a container of its own, removed even
  // when the run is cancelled. A group with neither needs no subject container; its graders still run in the image.
  const usesContainer = group.tools.includes("bash") || (group.commands?.length ?? 0) > 0;
  const declaredContainer = usesContainer ? group.variants[variant].shell?.container : undefined;
  let container = null;
  if (declaredContainer !== undefined) {
    const { containerTarget, startContainer } = await import("./container.mjs");
    container = await startContainer({ container: declaredContainer, workspace: subject.workspace });
    subject.processEnvironment.SKILL_EVAL_CONTAINER = containerTarget(container, declaredContainer);
  }
  let observation;
  try {
    observation = await subject.adapter.runSession({
      subject,
      command: subject.host.command,
      settings: subject.isolation.settings,
      args: subject.args,
      cwd: subject.workspace,
      eventsFile: subject.eventsFile,
      stderrFile: subject.stderrFile,
      signal,
      prompts: declaredPrompts,
      targetPath: subject.environment.targetPath,
      environment: subject.processEnvironment,
      nextPrompt,
      afterTurn: needsTurnWorkspaceEvidence(group)
        ? (turn) => snapshotWorkspace({ workspace: subject.workspace, variantDirectory, turn, before })
        : null,
    });
  } finally {
    await container?.remove();
  }
  const contextObservation = await readContextObservations(
    subject.contextObservationPath,
    subject.requiresContextObservation,
  );
  observation.contextObservationArtifact = contextObservation.artifact;
  if (contextObservation.error) (observation.protocolErrors ??= []).push(contextObservation.error);
  await verifySubjectResources(subject, observation);
  const after = await fingerprintDirectory(subject.workspace);

  const turns = [];
  for (const [index, turn] of observation.turns.entries()) {
    turns.push({
      turn: turn.turn,
      prompt: declaredPrompts[index] ?? turn.prompt,
      deliveredPrompt: turn.prompt,
      response: turn.response,
      transcript: turn.transcript,
      successfulReadPaths: await canonicalReadPaths(turn.successfulReads, subject.workspace),
      toolActivity: turn.toolActivity,
      promptAccepted: turn.promptAccepted,
      usage: turn.usage,
      assistantError: turn.assistantError,
      settled: turn.settled,
      workspace: turn.workspace ?? null,
    });
  }

  const input =
    group.input.prompt === undefined
      ? { prompt: null, prompts: declaredPrompts, turns }
      : {
          prompt: group.input.prompt,
          deliveredPrompt: turns[0]?.deliveredPrompt ?? null,
          successfulReadPaths: turns[0]?.successfulReadPaths ?? [],
          toolActivity: turns[0]?.toolActivity ?? [],
        };
  return bodyRun(options, subject, observation, input, {
    before,
    after,
    changes: workspaceChanges(before, after),
  });
}

function needsTurnWorkspaceEvidence(group) {
  return group.expectations.some(
    (expectation) => Number.isInteger(expectation.turn) && TURN_WORKSPACE_KINDS.has(expectation.kind),
  );
}

function bodyRun(options, subject, observation, input, effects) {
  return {
    ...subjectRun(options, subject, observation),
    evaluationType: "body",
    ...input,
    delivery: observation.delivery,
    effects,
  };
}

function subjectRun({ group, variant }, subject, observation) {
  const run = {
    schema_version: 1,
    variant,
    state: subjectRunState(observation),
    startedAt: subject.startedAt,
    completedAt: new Date().toISOString(),
    workspace: subject.workspace,
    tools: [...group.tools],
    commands: group.commands ?? [],
    model: {
      declared: group.variants[variant].model ?? null,
      observed: observation.model,
    },
    resources: {
      fixture: subject.fixture,
      source: subject.environment.source,
      skills: subject.environment.skills,
      context: subject.environment.context,
      runtime: subject.runtime,
      freeflow: subject.freeflow,
      hostExtensions: subject.hostExtensions,
      contextDelivery: subject.environment.contextDelivery,
      targetPath: subject.environment.targetPath,
    },
    isolation: subject.isolation,
    contextObservationArtifact: observation.contextObservationArtifact ?? null,
    response: observation.response,
    transcript: observation.transcript,
    usage: observation.usage,
    process: {
      command: subject.host.command,
      host: subject.host.name,
      args: subject.args,
      exitCode: observation.exitCode,
      signal: observation.signal,
      settled: observation.settled,
      assistantError: observation.assistantError,
      terminationReason: observation.terminationReason,
      parseErrors: observation.parseErrors,
      protocolErrors: observation.protocolErrors ?? [],
      stderr: subject.stderrFile,
    },
  };
  // Run-metrics hooks derive their fields from what this run already recorded.
  const metrics = runMetrics({ group, arm: variant, subject, observation, run });
  if (metrics !== null) run.metrics = metrics;
  return run;
}

async function runOneShotDescription(options) {
  const subject = await prepareSubject(options, "json");
  const observation = await subject.adapter.runOneShot({
    subject,
    command: subject.host.command,
    args: subject.args,
    cwd: subject.workspace,
    eventsFile: subject.eventsFile,
    stderrFile: subject.stderrFile,
    signal: options.signal,
    // Pi takes the prompt as its last argument (`args`); a host that reads prompts from stdin takes it here.
    prompts: [options.group.input.prompt],
    environment: subject.processEnvironment,
  });
  const contextObservation = await readContextObservations(
    subject.contextObservationPath,
    subject.requiresContextObservation,
  );
  observation.contextObservationArtifact = contextObservation.artifact;
  if (contextObservation.error) (observation.protocolErrors ??= []).push(contextObservation.error);
  await verifySubjectResources(subject, observation);
  const successfulReadPaths = await canonicalReadPaths(observation.successfulReads, subject.workspace);
  const targetRead =
    subject.environment.targetPath !== null && successfulReadPaths.includes(subject.environment.targetPath);
  return descriptionRun(options, subject, observation, {
    input: { prompt: options.group.input.prompt },
    toolActivity: observation.toolActivity ?? [],
    activation: {
      targetRead,
      firstReadTurn: targetRead ? 1 : null,
      readTurns: targetRead ? [1] : [],
      successfulReadPaths,
    },
  });
}

async function runPersistentDescription(options) {
  const subject = await prepareSubject(options, "rpc");
  const observation = await subject.adapter.runSession({
    subject,
    command: subject.host.command,
    settings: subject.isolation.settings,
    args: subject.args,
    cwd: subject.workspace,
    eventsFile: subject.eventsFile,
    stderrFile: subject.stderrFile,
    signal: options.signal,
    prompts: options.group.input.turns,
    environment: subject.processEnvironment,
  });
  const contextObservation = await readContextObservations(
    subject.contextObservationPath,
    subject.requiresContextObservation,
  );
  observation.contextObservationArtifact = contextObservation.artifact;
  if (contextObservation.error) (observation.protocolErrors ??= []).push(contextObservation.error);
  await verifySubjectResources(subject, observation);

  const turns = [];
  for (const turn of observation.turns) {
    const successfulReadPaths = await canonicalReadPaths(turn.successfulReads, subject.workspace);
    const targetRead =
      subject.environment.targetPath !== null && successfulReadPaths.includes(subject.environment.targetPath);
    turns.push({
      turn: turn.turn,
      prompt: turn.prompt,
      response: turn.response,
      transcript: turn.transcript,
      successfulReadPaths,
      toolActivity: turn.toolActivity,
      promptAccepted: turn.promptAccepted,
      usage: turn.usage,
      assistantError: turn.assistantError,
      settled: turn.settled,
      targetRead,
    });
  }
  const readTurns = turns.filter((turn) => turn.targetRead).map((turn) => turn.turn);
  return descriptionRun(options, subject, observation, {
    input: { prompt: null, prompts: [...options.group.input.turns], turns },
    activation: {
      targetRead: readTurns.length > 0,
      firstReadTurn: readTurns[0] ?? null,
      readTurns,
      successfulReadPaths: [...new Set(turns.flatMap((turn) => turn.successfulReadPaths))],
    },
  });
}

async function prepareSubject(
  {
    group,
    variant,
    root,
    variantDirectory,
    fixture: fixtureSnapshot,
    runtime,
    freeflow = null,
    hostExtensions = [],
    extendEnvironment = null,
  },
  mode,
) {
  const workspace = path.join(variantDirectory, "workspace");

  let environment;
  let fixture;
  let materializedRuntime;
  let adapter;
  let isolation;
  try {
    environment = await materializeEnvironment({
      environment: group.variants[variant],
      root,
      variantDirectory,
    });
    // A pipeline stage adds what it declares it sees from earlier stages as further declared context.
    if (extendEnvironment !== null) await extendEnvironment(environment, variantDirectory);
    materializedRuntime = await materializeRuntime({ runtime, variantDirectory });
    // Runtime environment literals may differ between arms (definitions.mjs); each subject gets its arm's own.
    const literal = group.variants[variant].runtimeLiteral;
    if (literal !== undefined) materializedRuntime.environment = { ...materializedRuntime.environment, literal };
    fixture = await materializeFixture({ fixture: fixtureSnapshot, workspace });
    // Written before the workspace's starting state is taken, so they never count as the subject's changes.
    if (freeflow !== null) await writeFreeflowSettings(workspace, freeflow);
    adapter = hostAdapter(materializedRuntime.host);
    isolation = await adapter.prepareIsolation(variantDirectory, group.variants[variant].model?.model ?? null, {
      settings: adapter.effectiveSettings(group.variants[variant].hostSettings ?? {}),
    });
  } catch (error) {
    if (error instanceof VariantSetupError) throw error;
    throw new VariantSetupError(error instanceof Error ? error.message : String(error));
  }

  const host = { name: materializedRuntime.host, command: adapter.command };
  const contextObservationPath = path.join(variantDirectory, "context-observations.jsonl");
  const requiresContextObservation = group.expectations.some((expectation) => expectation.kind === "context-text");
  const sessionDirectory = path.join(variantDirectory, "session");
  if (materializedRuntime.session) await mkdir(sessionDirectory, { recursive: true });
  const allowedRoots = [
    await realpath(workspace),
    ...environment.skills.map((skill) => skill.path),
    ...environment.context.map((entry) => entry.path),
    ...materializedRuntime.extensions.flatMap((bundle) => bundle.resources.map((resource) => resource.path)),
    // Freeflow points the subject at its own skills and references inside the package.
    ...(freeflow === null ? [] : [freeflow.packageRoot]),
  ];
  let launch;
  try {
    launch = await adapter.prepareLaunch({
      group,
      variant,
      environment,
      runtime: materializedRuntime,
      mode,
      observeContext: requiresContextObservation,
      contextObservationPath,
      sessionDirectory,
      model: group.variants[variant].model,
      freeflowEntry: freeflow?.entry ?? null,
      hostExtensions,
      workspace,
      variantDirectory,
      allowedRoots,
      isolation: isolation.evidence,
    });
  } catch (error) {
    if (error instanceof VariantSetupError) throw error;
    throw new VariantSetupError(error instanceof Error ? error.message : String(error));
  }
  return {
    adapter,
    args: launch.args,
    environment,
    hostExtensions,
    freeflow:
      freeflow === null
        ? null
        : {
            ref: freeflow.ref,
            commit: freeflow.commit,
            package: freeflow.package,
            tarballSha256: freeflow.tarballSha256,
            metadata: freeflow.metadata,
            repository: freeflow.repository,
            personal: freeflow.personal,
          },
    runtime: materializedRuntime,
    host,
    fixture,
    workspace,
    contextObservationPath,
    requiresContextObservation,
    sessionDirectory,
    eventsFile: path.join(variantDirectory, "events.jsonl"),
    stderrFile: path.join(variantDirectory, "stderr.log"),
    startedAt: new Date().toISOString(),
    isolation: isolation.evidence,
    processEnvironment: {
      ...createProcessEnvironment({
        runtime: materializedRuntime,
        group,
        workspace,
        allowedRoots,
        contextManifestPath: environment.contextDelivery.manifestPath,
        contextObservationPath,
        requiresContextObservation,
        hostEnvironment: launch.environment,
      }),
      // A declared shell lets the guard allow bash; its isolation extension runs it.
      ...(group.variants[variant].shell ? { SKILL_EVAL_SHELL: JSON.stringify(group.variants[variant].shell) } : {}),
      // Last, so nothing inherited or declared can point the subject back at the parent's home or Pi settings.
      ...isolation.environment,
    },
  };
}

function createProcessEnvironment({
  runtime,
  group,
  workspace,
  allowedRoots,
  contextManifestPath,
  contextObservationPath,
  requiresContextObservation,
  hostEnvironment,
}) {
  const processEnvironment = baseProcessEnvironment();
  Object.assign(processEnvironment, {
    PWD: workspace,
    ...runtime.environment.literal,
    // The host's own variables, such as Pi's version check and telemetry switches, after declared literals.
    ...hostEnvironment,
    SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify(allowedRoots),
    SKILL_EVAL_WRITABLE_ROOT: workspace,
    SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(group.tools),
    SKILL_EVAL_CONTEXT_MANIFEST: contextManifestPath ?? "",
    SKILL_EVAL_HOST: runtime.host,
    SKILL_EVAL_PROMPT_MODE: runtime.prompt,
  });
  if (group.commands !== undefined) processEnvironment.SKILL_EVAL_COMMANDS = JSON.stringify(group.commands);
  for (const key of runtime.environment.inherit) {
    if (process.env[key] === undefined) {
      throw new VariantSetupError(`inherited runtime environment variable is unavailable: ${key}`);
    }
    processEnvironment[key] = process.env[key];
  }
  if (requiresContextObservation) processEnvironment.SKILL_EVAL_CONTEXT_OBSERVATION_PATH = contextObservationPath;
  return processEnvironment;
}

// A missing or malformed observation fails the subject but keeps everything the process already reported:
// transcript, response, usage, and process evidence stay in run.json.
async function readContextObservations(file, required) {
  let contents;
  try {
    contents = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!required) return { observations: [], artifact: null, error: null };
    return {
      observations: [],
      artifact: null,
      error: { reason: "context-observer-missing", message: "context observer produced no evidence" },
    };
  }
  const observations = [];
  for (const line of contents.split("\n").filter(Boolean)) {
    try {
      observations.push(JSON.parse(line));
    } catch (error) {
      return {
        observations: [],
        artifact: null,
        error: {
          reason: "context-observation-malformed",
          message: `context observation is malformed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }
  return {
    observations,
    error: null,
    artifact:
      contents === ""
        ? null
        : {
            path: file,
            sha256: createHash("sha256").update(contents, "utf8").digest("hex"),
            bytes: Buffer.byteLength(contents, "utf8"),
            count: observations.length,
            surfaces: [...new Set(observations.map((entry) => entry.surface).filter(Boolean))],
          },
  };
}

async function verifySubjectResources(subject, observation) {
  try {
    await verifyEnvironment(subject.environment);
    await verifyRuntime(subject.runtime);
  } catch (error) {
    observation.protocolErrors ??= [];
    observation.protocolErrors.push({
      reason: "immutable-resource-changed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function descriptionRun(options, subject, observation, { input, activation, toolActivity }) {
  return {
    ...subjectRun(options, subject, observation),
    evaluationType: "description",
    ...input,
    ...(toolActivity === undefined ? {} : { toolActivity }),
    activation,
  };
}

function subjectRunState(observation) {
  if (observation.terminationReason === "cancelled") return "cancelled";
  if (
    observation.exitCode === 0 &&
    observation.settled &&
    observation.assistantError === null &&
    observation.parseErrors.length === 0 &&
    (observation.protocolErrors?.length ?? 0) === 0
  ) {
    return "complete";
  }
  return "infrastructure-failed";
}

async function canonicalReadPaths(paths, cwd) {
  const canonical = [];
  for (const rawPath of paths) {
    const value = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath;
    const resolved = await realpath(path.resolve(cwd, value)).catch(() => null);
    if (resolved !== null && !canonical.includes(resolved)) canonical.push(resolved);
  }
  return canonical;
}
