import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { cp, mkdir, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256 } from "./evidence.mjs";
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
import { runRpcDescriptionSession } from "./rpc.mjs";

const VARIANT_TOOLS = new Set(["read"]);
const guardExtension = fileURLToPath(new URL("../pi-guard.mjs", import.meta.url));

export class VariantSetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "VariantSetupError";
  }
}

export async function runDescription({ group, variant, root, variantDirectory, signal }) {
  if (group.input.turns !== undefined) {
    return runPersistentDescription({ group, variant, root, variantDirectory, signal });
  }
  return runOneShotDescription({ group, variant, root, variantDirectory, signal });
}

async function runOneShotDescription(options) {
  const subject = await prepareDescriptionSubject(options, "json");
  const observation = await runPiProcess({
    args: subject.args,
    cwd: subject.workspace,
    eventsFile: subject.eventsFile,
    stderrFile: subject.stderrFile,
    signal: options.signal,
    environment: subject.processEnvironment,
  });
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
  const subject = await prepareDescriptionSubject(options, "rpc");
  const observation = await runRpcDescriptionSession({
    args: subject.args,
    cwd: subject.workspace,
    eventsFile: subject.eventsFile,
    stderrFile: subject.stderrFile,
    signal: options.signal,
    prompts: options.group.input.turns,
    environment: subject.processEnvironment,
  });

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

async function prepareDescriptionSubject({ group, variant, root, variantDirectory }, mode) {
  const workspace = path.join(variantDirectory, "workspace");
  await mkdir(workspace, { recursive: true });

  let environment;
  try {
    environment = await prepareEnvironment(group, variant, root);
    environment = await materializeEnvironment(environment, variantDirectory);
  } catch (error) {
    if (error instanceof VariantSetupError) throw error;
    throw new VariantSetupError(error instanceof Error ? error.message : String(error));
  }

  const args = piArguments(group, environment, mode);
  const allowedRoots = [await realpath(workspace), ...environment.skills.map((skill) => skill.path)];
  return {
    args,
    environment,
    workspace,
    eventsFile: path.join(variantDirectory, "events.jsonl"),
    stderrFile: path.join(variantDirectory, "stderr.log"),
    startedAt: new Date().toISOString(),
    processEnvironment: {
      ...process.env,
      PI_SKIP_VERSION_CHECK: "1",
      PI_TELEMETRY: "0",
      SKILL_EVAL_ALLOWED_ROOTS: JSON.stringify(allowedRoots),
      SKILL_EVAL_ALLOWED_TOOLS: JSON.stringify(group.tools),
    },
  };
}

function descriptionRun({ group, variant }, subject, observation, { input, activation }) {
  return {
    schema_version: 1,
    variant,
    state: subjectRunState(observation),
    evaluationType: "description",
    startedAt: subject.startedAt,
    completedAt: new Date().toISOString(),
    workspace: subject.workspace,
    ...input,
    tools: [...group.tools],
    model: {
      declared: group.model ?? null,
      observed: observation.model,
    },
    resources: {
      skills: subject.environment.skills,
      targetPath: subject.environment.targetPath,
    },
    activation,
    response: observation.response,
    transcript: observation.transcript,
    usage: observation.usage,
    process: {
      command: "pi",
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

async function prepareEnvironment(group, variant, root) {
  const environment = group.variants[variant];
  if (group.fixture !== null) {
    throw new VariantSetupError("description execution does not materialize fixtures yet");
  }
  if (group.input.prompt === undefined && group.input.turns === undefined) {
    throw new VariantSetupError("description execution requires input.prompt or input.turns");
  }
  if (environment.source.kind !== "working-tree") {
    throw new VariantSetupError("description execution currently requires working-tree skill sources");
  }
  if (environment.context.length > 0) {
    throw new VariantSetupError("description execution does not deliver declared context yet");
  }
  const unsupportedTools = group.tools.filter((tool) => !VARIANT_TOOLS.has(tool));
  if (unsupportedTools.length > 0) {
    throw new VariantSetupError(`unsupported description tools: ${unsupportedTools.join(", ")}`);
  }

  const canonicalRoot = await realpath(root);
  const skills = [];
  for (const relativeSkill of environment.skills) {
    const skillPath = await realpath(path.resolve(root, relativeSkill)).catch(() => null);
    if (skillPath === null || !isContained(canonicalRoot, skillPath)) {
      throw new VariantSetupError(`declared skill is missing or escapes the definition root: ${relativeSkill}`);
    }
    const skillStat = await stat(skillPath);
    if (!skillStat.isDirectory()) {
      throw new VariantSetupError(`declared skill is not a directory: ${relativeSkill}`);
    }
    const skillFile = await realpath(path.join(skillPath, "SKILL.md")).catch(() => null);
    if (skillFile === null || !isContained(skillPath, skillFile)) {
      throw new VariantSetupError(`declared skill has no contained SKILL.md: ${relativeSkill}`);
    }
    skills.push({
      declaredPath: relativeSkill,
      path: skillPath,
      files: await hashDirectory(skillPath),
    });
  }

  return { skills, targetIndex: environment.target };
}

async function materializeEnvironment(environment, variantDirectory) {
  const skillsRoot = path.join(variantDirectory, "resources", "skills");
  await mkdir(skillsRoot, { recursive: true });
  const skills = [];
  for (const [index, skill] of environment.skills.entries()) {
    const snapshotPath = path.join(skillsRoot, String(index));
    await cp(skill.path, snapshotPath, { recursive: true, dereference: true, errorOnExist: true, force: false });
    const canonicalSnapshot = await realpath(snapshotPath);
    const files = await hashDirectory(canonicalSnapshot);
    if (JSON.stringify(files) !== JSON.stringify(skill.files)) {
      throw new VariantSetupError(`declared skill changed while it was being snapshotted: ${skill.declaredPath}`);
    }
    skills.push({
      declaredPath: skill.declaredPath,
      sourcePath: skill.path,
      path: canonicalSnapshot,
      files,
    });
  }
  const targetPath =
    environment.targetIndex === null
      ? null
      : await realpath(path.join(skills[environment.targetIndex].path, "SKILL.md"));
  return { skills, targetPath };
}

function piArguments(group, environment, mode) {
  const args = ["--mode", mode];
  if (mode === "json") args.push("-p");
  args.push(
    "--no-session",
    "--no-extensions",
    "--extension",
    guardExtension,
    "--no-skills",
    "--no-prompt-templates",
    "--no-themes",
    "--no-context-files",
    "--no-approve",
  );
  if (group.tools.length === 0) args.push("--no-tools");
  else args.push("--tools", group.tools.join(","));
  for (const skill of environment.skills) args.push("--skill", skill.path);
  if (group.model?.model) args.push("--model", group.model.model);
  if (group.model?.thinking) args.push("--thinking", group.model.thinking);
  if (mode === "json") args.push(group.input.prompt);
  return args;
}

async function runPiProcess({ args, cwd, eventsFile, stderrFile, signal, environment }) {
  const child = spawn("pi", args, {
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

async function hashDirectory(root) {
  const files = [];
  const visited = new Set();
  await walk(root, root, files, visited);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function walk(root, directory, files, visited) {
  const canonicalDirectory = await realpath(directory);
  if (!isContained(root, canonicalDirectory) || visited.has(canonicalDirectory)) return;
  visited.add(canonicalDirectory);
  const entries = await readdir(canonicalDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(canonicalDirectory, entry.name);
    const canonicalEntry = await realpath(entryPath);
    if (!isContained(root, canonicalEntry)) {
      throw new VariantSetupError(`skill resource escapes its package: ${entryPath}`);
    }
    const entryStat = await stat(canonicalEntry);
    if (entryStat.isDirectory()) {
      await walk(root, canonicalEntry, files, visited);
    } else if (entryStat.isFile()) {
      files.push({
        path: path.relative(root, canonicalEntry),
        sha256: sha256(await readFile(canonicalEntry)),
      });
    }
  }
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
