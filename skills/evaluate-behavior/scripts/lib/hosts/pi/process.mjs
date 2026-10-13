// How the evaluator launches Pi itself: the command-line arguments for a subject and the one-shot JSON-mode process
// that reports Pi's events. RPC sessions are in rpc.mjs.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
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
} from "../../process.mjs";

const guardExtension = fileURLToPath(new URL("../../../pi-guard.mjs", import.meta.url));

/** The evaluator's guard extension, which every subject process (and a shell's confinement probe) loads first. */
export function guardExtensionPath() {
  return guardExtension;
}
const commandToolExtension = fileURLToPath(new URL("../../../pi-command-tool.mjs", import.meta.url));
const observerExtension = fileURLToPath(new URL("../../../pi-observer.mjs", import.meta.url));

export function piArguments(
  group,
  environment,
  runtime,
  mode,
  observeContext,
  sessionDirectory,
  model,
  freeflowEntry,
  hostExtensions = [],
) {
  const args = ["--mode", mode];
  if (mode === "json") args.push("-p");
  if (runtime.session) args.push("--session-dir", sessionDirectory);
  else args.push("--no-session");
  args.push("--no-extensions", "--extension", guardExtension);
  // Provider extensions (such as a subscription's auth extension) load right after the guard.
  for (const extension of hostExtensions) args.push("--extension", extension.path);
  if (group.commands !== undefined) args.push("--extension", commandToolExtension);
  if (freeflowEntry !== null) args.push("--extension", freeflowEntry);
  for (const bundle of runtime.extensions) args.push("--extension", bundle.entry);
  if (observeContext) args.push("--extension", observerExtension);
  args.push("--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-approve");
  if (group.tools.length === 0) args.push("--no-tools");
  else args.push("--tools", group.tools.join(","));
  for (const skill of environment.skills) args.push("--skill", skill.path);
  if (model?.model) args.push("--model", model.model);
  if (model?.thinking) args.push("--thinking", model.thinking);
  if (mode === "json") args.push(group.input.prompt);
  return args;
}

export async function runPiProcess({ command, args, cwd, eventsFile, stderrFile, signal, environment }) {
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
  const toolActivity = [];
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
      // Same shape as RPC turns record, so graders and the advisory reviewer see one-shot tool use too.
      const activity = {
        toolCallId: event.toolCallId ?? null,
        toolName: event.toolName ?? null,
        args: event.args ?? null,
        completed: false,
        isError: null,
      };
      toolActivity.push(activity);
      calls.set(event.toolCallId, activity);
    }
    if (event.type === "tool_execution_end") {
      const call = calls.get(event.toolCallId);
      if (call) {
        call.completed = true;
        call.isError = event.isError === true;
      }
      if (!event.isError && call?.toolName === "read" && typeof call.args?.path === "string") {
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
    toolActivity,
    transcript,
    response,
    usage,
  };
}
