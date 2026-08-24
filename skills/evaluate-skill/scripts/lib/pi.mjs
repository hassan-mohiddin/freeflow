import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  mergeUsage,
  messageText,
  NO_PROGRESS_MS,
  pipeStream,
  processGroupExists,
  signalProcessTree,
  TERMINATION_GRACE_MS,
  waitForForcedKill,
  writeStream,
} from "./process.mjs";
import { runRpcBodySession, runRpcDescriptionSession } from "./rpc.mjs";
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

const guardExtension = fileURLToPath(new URL("../pi-guard.mjs", import.meta.url));
const observerExtension = fileURLToPath(new URL("../pi-observer.mjs", import.meta.url));
const HOST_COMMANDS = { pi: "pi", piflow: "piflow" };
const TURN_WORKSPACE_KINDS = new Set(["path", "changed-paths", "file-text", "json"]);

export class VariantSetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "VariantSetupError";
  }
}

export async function runDescription({ group, variant, root, variantDirectory, fixture, runtime, signal }) {
  if (group.input.turns !== undefined) {
    return runPersistentDescription({ group, variant, root, variantDirectory, fixture, runtime, signal });
  }
  return runOneShotDescription({ group, variant, root, variantDirectory, fixture, runtime, signal });
}

export async function runBody({ group, variant, root, variantDirectory, fixture, runtime, signal }) {
  const options = { group, variant, root, variantDirectory, fixture, runtime, signal };
  const subject = await prepareSubject(options, "rpc");
  const before = await fingerprintDirectory(subject.workspace);
  const declaredPrompts = group.input.prompt === undefined ? [...group.input.turns] : [group.input.prompt];
  const observation = await runRpcBodySession({
    args: subject.args,
    cwd: subject.workspace,
    eventsFile: subject.eventsFile,
    stderrFile: subject.stderrFile,
    signal,
    prompts: declaredPrompts,
    targetPath: subject.environment.targetPath,
    environment: subject.processEnvironment,
    afterTurn: needsTurnWorkspaceEvidence(group)
      ? (turn) => snapshotWorkspace({ workspace: subject.workspace, variantDirectory, turn, before })
      : null,
  });
  const contextObservation = await readContextObservations(
    subject.contextObservationPath,
    subject.requiresContextObservation,
  );
  observation.contextObservationArtifact = contextObservation.artifact;
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
  return {
    schema_version: 1,
    variant,
    state: subjectRunState(observation),
    startedAt: subject.startedAt,
    completedAt: new Date().toISOString(),
    workspace: subject.workspace,
    tools: [...group.tools],
    model: {
      declared: group.model ?? null,
      observed: observation.model,
    },
    resources: {
      fixture: subject.fixture,
      source: subject.environment.source,
      skills: subject.environment.skills,
      context: subject.environment.context,
      runtime: subject.runtime,
      contextDelivery: subject.environment.contextDelivery,
      targetPath: subject.environment.targetPath,
    },
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
}

async function runOneShotDescription(options) {
  const subject = await prepareSubject(options, "json");
  const observation = await runPiProcess({
    command: subject.host.command,
    args: subject.args,
    cwd: subject.workspace,
    eventsFile: subject.eventsFile,
    stderrFile: subject.stderrFile,
    signal: options.signal,
    environment: subject.processEnvironment,
  });
  const contextObservation = await readContextObservations(
    subject.contextObservationPath,
    subject.requiresContextObservation,
  );
  observation.contextObservationArtifact = contextObservation.artifact;
  await verifySubjectResources(subject, observation);
  const successfulReadPaths = await canonicalReadPaths(observation.successfulReads, subject.workspace);
  const targetRead =
    subject.environment.targetPath !== null && successfulReadPaths.includes(subject.environment.targetPath);
  return descriptionRun(options, subject, observation, {
    input: { prompt: options.group.input.prompt },
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
  const observation = await runRpcDescriptionSession({
    command: subject.host.command,
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

async function prepareSubject({ group, variant, root, variantDirectory, fixture: fixtureSnapshot, runtime }, mode) {
  const workspace = path.join(variantDirectory, "workspace");

  let environment;
  let fixture;
  let materializedRuntime;
  try {
    environment = await materializeEnvironment({
      environment: group.variants[variant],
      root,
      variantDirectory,
    });
    materializedRuntime = await materializeRuntime({ runtime, variantDirectory });
    fixture = await materializeFixture({ fixture: fixtureSnapshot, workspace });
  } catch (error) {
    if (error instanceof VariantSetupError) throw error;
    throw new VariantSetupError(error instanceof Error ? error.message : String(error));
  }

  const host = { name: materializedRuntime.host, command: HOST_COMMANDS[materializedRuntime.host] };
  const contextObservationPath = path.join(variantDirectory, "context-observations.jsonl");
  const requiresContextObservation = group.expectations.some((expectation) => expectation.kind === "context-text");
  const sessionDirectory = path.join(variantDirectory, "session");
  if (materializedRuntime.session) await mkdir(sessionDirectory, { recursive: true });
  const args = piArguments(group, environment, materializedRuntime, mode, requiresContextObservation, sessionDirectory);
  const allowedRoots = [
    await realpath(workspace),
    ...environment.skills.map((skill) => skill.path),
    ...environment.context.map((entry) => entry.path),
    ...materializedRuntime.extensions.flatMap((bundle) => bundle.resources.map((resource) => resource.path)),
  ];
  return {
    args,
    environment,
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
    processEnvironment: createProcessEnvironment({
      runtime: materializedRuntime,
      group,
      workspace,
      allowedRoots,
      contextManifestPath: environment.contextDelivery.manifestPath,
      contextObservationPath,
      requiresContextObservation,
    }),
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
}) {
  const processEnvironment = { ...process.env };
  for (const key of Object.keys(processEnvironment)) {
    if (key.startsWith("PI_")) delete processEnvironment[key];
  }
  Object.assign(processEnvironment, {
    ...runtime.environment.literal,
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
    SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify(allowedRoots),
    SKILL_EVAL_WRITABLE_ROOT: workspace,
    SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(group.tools),
    SKILL_EVAL_CONTEXT_MANIFEST: contextManifestPath ?? "",
    SKILL_EVAL_HOST: runtime.host,
  });
  for (const key of runtime.environment.inherit) {
    if (process.env[key] === undefined) {
      throw new VariantSetupError(`inherited runtime environment variable is unavailable: ${key}`);
    }
    processEnvironment[key] = process.env[key];
  }
  if (requiresContextObservation) processEnvironment.SKILL_EVAL_CONTEXT_OBSERVATION_PATH = contextObservationPath;
  return processEnvironment;
}

async function readContextObservations(file, required) {
  const contents = await readFile(file, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      if (required) throw new Error("context observer produced no evidence");
      return "";
    }
    throw error;
  });
  const observations = [];
  for (const line of contents.split("\n").filter(Boolean)) {
    try {
      observations.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`context observation is malformed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    observations,
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

function descriptionRun(options, subject, observation, { input, activation }) {
  return {
    ...subjectRun(options, subject, observation),
    evaluationType: "description",
    ...input,
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

function piArguments(group, environment, runtime, mode, observeContext, sessionDirectory) {
  const args = ["--mode", mode];
  if (mode === "json") args.push("-p");
  if (runtime.session) args.push("--session-dir", sessionDirectory);
  else args.push("--no-session");
  args.push("--no-extensions", "--extension", guardExtension);
  for (const bundle of runtime.extensions) args.push("--extension", bundle.entry);
  if (observeContext) args.push("--extension", observerExtension);
  args.push("--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-approve");
  if (group.tools.length === 0) args.push("--no-tools");
  else args.push("--tools", group.tools.join(","));
  for (const skill of environment.skills) args.push("--skill", skill.path);
  if (group.model?.model) args.push("--model", group.model.model);
  if (group.model?.thinking) args.push("--thinking", group.model.thinking);
  if (mode === "json") args.push(group.input.prompt);
  return args;
}

async function runPiProcess({ command, args, cwd, eventsFile, stderrFile, signal, environment }) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: environment,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const events = createWriteStream(eventsFile, { encoding: "utf8" });
  const stderr = createWriteStream(stderrFile, { encoding: "utf8" });
  const transcript = [];
  const calls = new Map();
  const successfulReads = [];
  const parseErrors = [];
  const protocolErrors = [];
  let settled = false;
  let response = "";
  let usage = null;
  let assistantError = null;
  let observedModel = null;
  let buffer = "";
  let eventLine = 0;
  const processGroupId = child.pid;
  let watchdog;
  let forcedKill;
  /** @type {Promise<void> | null} */
  let forcedKillPromise = null;
  let terminationReason = null;

  const resetWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => requestTermination("no-progress-watchdog"), NO_PROGRESS_MS);
    watchdog.unref();
  };
  const requestTermination = (reason) => {
    if (terminationReason !== null) return;
    terminationReason = reason;
    signalProcessTree(processGroupId, child, "SIGTERM");
    if (process.platform !== "win32") {
      forcedKillPromise = new Promise((resolve) => {
        forcedKill = setTimeout(() => {
          signalProcessTree(processGroupId, child, "SIGKILL");
          resolve();
        }, TERMINATION_GRACE_MS);
      });
    }
  };
  const onAbort = () => requestTermination("cancelled");
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  resetWatchdog();

  const stderrTask = pipeStream(child.stderr, stderr, resetWatchdog);
  const stdoutTask = (async () => {
    for await (const chunk of child.stdout) {
      resetWatchdog();
      buffer += chunk.toString("utf8");
      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline === -1) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        await writeStream(events, `${line}\n`);
        observeLine(line.endsWith("\r") ? line.slice(0, -1) : line);
      }
    }
    if (buffer.length > 0) {
      await writeStream(events, buffer);
      observeLine(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
    }
    events.end();
    await once(events, "finish");
  })();

  function observeLine(line) {
    eventLine += 1;
    if (line.trim() === "") return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      parseErrors.push({ line: eventLine, reason: "invalid-json" });
      return;
    }
    if (event.type === "extension_error") {
      protocolErrors.push({
        reason: "extension-error",
        extensionPath: event.extensionPath ?? null,
        event: event.event ?? null,
        error: event.error ?? null,
      });
      requestTermination("protocol-error");
    }
    if (event.type === "agent_settled") settled = true;
    if (event.type === "tool_execution_start") {
      calls.set(event.toolCallId, { toolName: event.toolName, args: event.args });
    }
    if (event.type === "tool_execution_end" && !event.isError) {
      const call = calls.get(event.toolCallId);
      if (call?.toolName === "read" && typeof call.args?.path === "string") {
        successfulReads.push(call.args.path);
      }
    }
    if (event.type === "message_end" && event.message) {
      transcript.push(event.message);
      if (event.message.role === "assistant") {
        response = messageText(event.message);
        usage = mergeUsage(usage, event.message.usage);
        observedModel = {
          provider: event.message.provider ?? null,
          model: event.message.model ?? null,
        };
        assistantError =
          event.message.stopReason === "error" || event.message.stopReason === "aborted"
            ? (event.message.errorMessage ?? `assistant stopped with ${event.message.stopReason}`)
            : null;
      }
    }
  }

  let exitCode = null;
  let exitSignal = null;
  try {
    const [code, closedSignal] = await once(child, "close");
    exitCode = code;
    exitSignal = closedSignal;
    await Promise.all([stdoutTask, stderrTask]);
  } catch (error) {
    requestTermination("process-error");
    throw error;
  } finally {
    clearTimeout(watchdog);
    if (forcedKillPromise !== null) {
      if (processGroupExists(processGroupId)) await waitForForcedKill(forcedKillPromise);
      else clearTimeout(forcedKill);
    }
    signal?.removeEventListener("abort", onAbort);
  }

  return {
    exitCode,
    signal: exitSignal,
    settled,
    assistantError,
    model: observedModel,
    terminationReason,
    parseErrors,
    protocolErrors,
    successfulReads,
    transcript,
    response,
    usage,
  };
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
