import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";

import {
  mergeUsage,
  messageText,
  NO_PROGRESS_MS,
  pipeStream,
  processGroupExists,
  signalProcessTree,
  TERMINATION_GRACE_MS,
  waitForForcedKill,
  waitForProcessTreeExit,
  writeStream,
} from "./process.mjs";

const MAX_INCOMPLETE_FRAME_BYTES = 16 * 1024 * 1024;

export async function runRpcDescriptionSession(options) {
  return new RpcDescriptionSession(options).run(options.prompts);
}

class RpcDescriptionSession {
  constructor({ args, cwd, eventsFile, stderrFile, signal, environment }) {
    this.child = spawn("pi", args, {
      cwd,
      detached: process.platform !== "win32",
      env: environment,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.signal = signal;
    this.processGroupId = this.child.pid;
    this.events = createWriteStream(eventsFile, { encoding: "utf8" });
    this.stderr = createWriteStream(stderrFile, { encoding: "utf8" });
    this.pendingResponses = new Map();
    this.turns = [];
    this.transcript = [];
    this.parseErrors = [];
    this.protocolErrors = [];
    this.activeTurn = null;
    this.decoder = new StringDecoder("utf8");
    this.buffer = "";
    this.incompleteFrameBytes = 0;
    this.eventLine = 0;
    this.requestNumber = 0;
    this.observedModel = null;
    this.terminationReason = null;
    this.operationError = null;
    this.watchdog = undefined;
    this.forcedKill = undefined;
    /** @type {Promise<void> | null} */
    this.forcedKillPromise = null;

    this.onAbort = () => this.requestTermination("cancelled");
    if (signal?.aborted) this.onAbort();
    else signal?.addEventListener("abort", this.onAbort, { once: true });
    this.resetWatchdog();

    this.closed = new Promise((resolve, reject) => {
      this.child.once("error", reject);
      this.child.once("close", (exitCode, exitSignal) => {
        this.rejectWaiting(new Error("Pi RPC process closed before the operation completed"));
        resolve({ exitCode, exitSignal });
      });
    });
    this.stderrTask = pipeStream(this.child.stderr, this.stderr, () => this.resetWatchdog());
    this.stdoutTask = this.readStdout();
  }

  async run(prompts) {
    try {
      await this.configure();
      for (const [index, prompt] of prompts.entries()) {
        if (this.signal?.aborted || this.terminationReason !== null) break;
        const turn = await this.runTurn(index + 1, prompt);
        this.turns.push(turn);
        if (turn.assistantError !== null) break;
      }
    } catch (error) {
      this.operationError = error;
      if (this.terminationReason === null) {
        this.protocolErrors.push({
          reason: "operation-failed",
          message: error instanceof Error ? error.message : String(error),
        });
        this.requestTermination("protocol-error");
      }
    } finally {
      if (!this.child.stdin.destroyed) this.child.stdin.end();
    }

    const { exitCode, exitSignal } = await this.finishProcess();
    this.finalizeInterruptedTurn();
    this.recordUnclassifiedProcessError();
    return this.observation(prompts, exitCode, exitSignal);
  }

  async configure() {
    await this.sendCommand({ type: "set_auto_retry", enabled: false });
    await this.sendCommand({ type: "set_auto_compaction", enabled: false });
  }

  async runTurn(turnNumber, prompt) {
    let resolveSettled;
    let rejectSettled;
    const settlement = new Promise((resolve, reject) => {
      resolveSettled = resolve;
      rejectSettled = reject;
    });
    this.activeTurn = {
      turn: turnNumber,
      prompt,
      response: "",
      transcript: [],
      successfulReads: [],
      toolActivity: [],
      calls: new Map(),
      promptAccepted: false,
      usage: null,
      assistantError: null,
      settled: false,
      resolveSettled,
      rejectSettled,
    };
    await Promise.all([this.sendCommand({ type: "prompt", message: prompt }), settlement]);
    const result = finishTurn(this.activeTurn);
    this.activeTurn = null;
    return result;
  }

  async sendCommand(command) {
    if (this.terminationReason !== null) {
      throw new Error(`Pi RPC session terminated: ${this.terminationReason}`);
    }
    const id = `request-${++this.requestNumber}`;
    const response = new Promise((resolve, reject) => {
      this.pendingResponses.set(id, { command: command.type, resolve, reject });
    });
    this.resetWatchdog();
    await writeStream(this.child.stdin, `${JSON.stringify({ id, ...command })}\n`);
    return response;
  }

  async readStdout() {
    stdout: for await (const chunk of this.child.stdout) {
      this.resetWatchdog();
      this.incompleteFrameBytes += Buffer.isBuffer(chunk) ? chunk.byteLength : Buffer.byteLength(chunk);
      this.buffer += this.decoder.write(chunk);
      let completedFrame = false;
      while (true) {
        const newline = this.buffer.indexOf("\n");
        if (newline === -1) break;
        completedFrame = true;
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        await writeStream(this.events, `${line}\n`);
        this.observeLine(line.endsWith("\r") ? line.slice(0, -1) : line);
      }
      if (completedFrame) this.incompleteFrameBytes = Buffer.byteLength(this.buffer, "utf8");
      if (this.incompleteFrameBytes > MAX_INCOMPLETE_FRAME_BYTES) {
        this.failProtocol("incomplete-frame-limit", {
          limitBytes: MAX_INCOMPLETE_FRAME_BYTES,
          observedBytes: this.incompleteFrameBytes,
        });
        this.buffer = "";
        this.incompleteFrameBytes = 0;
        break stdout;
      }
    }
    this.buffer += this.decoder.end();
    if (this.buffer.length > 0) {
      await writeStream(this.events, this.buffer);
      this.parseErrors.push({ line: this.eventLine + 1, reason: "unterminated-record" });
    }
    this.events.end();
    await once(this.events, "finish");
  }

  observeLine(line) {
    this.eventLine += 1;
    if (line === "") {
      this.parseErrors.push({ line: this.eventLine, reason: "empty-record" });
      this.failProtocol("empty-record", { line: this.eventLine });
      return;
    }
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      this.parseErrors.push({ line: this.eventLine, reason: "invalid-json" });
      this.failProtocol("invalid-json", { line: this.eventLine });
      return;
    }
    if (event.type === "response") this.observeResponse(event);
    else if (event.type === "agent_settled") this.observeSettlement();
    else if (this.activeTurn !== null) this.observeTurnEvent(event);
  }

  observeResponse(event) {
    const pending = typeof event.id === "string" ? this.pendingResponses.get(event.id) : null;
    if (!pending) {
      this.failProtocol("unexpected-response", { line: this.eventLine, id: event.id ?? null });
      return;
    }
    this.pendingResponses.delete(event.id);
    if (event.command !== pending.command) {
      pending.reject(new Error(`Pi RPC response command mismatch for ${event.id}`));
      this.failProtocol("response-command-mismatch", {
        line: this.eventLine,
        id: event.id,
        expected: pending.command,
        observed: event.command ?? null,
      });
      return;
    }
    if (event.success !== true) {
      pending.reject(new Error(event.error ?? `Pi RPC command failed: ${pending.command}`));
      return;
    }
    if (pending.command === "prompt" && this.activeTurn !== null) {
      this.activeTurn.promptAccepted = true;
    }
    pending.resolve(event);
  }

  observeSettlement() {
    if (this.activeTurn === null || this.activeTurn.settled) {
      this.failProtocol("unexpected-agent-settled", { line: this.eventLine });
      return;
    }
    this.activeTurn.settled = true;
    this.activeTurn.resolveSettled();
  }

  observeTurnEvent(event) {
    if (event.type === "tool_execution_start") {
      const activity = {
        toolCallId: event.toolCallId ?? null,
        toolName: event.toolName ?? null,
        args: event.args ?? null,
        completed: false,
        isError: null,
      };
      this.activeTurn.toolActivity.push(activity);
      if (typeof event.toolCallId === "string") this.activeTurn.calls.set(event.toolCallId, activity);
      return;
    }
    if (event.type === "tool_execution_end") {
      this.observeToolEnd(event);
      return;
    }
    if (event.type === "message_end" && event.message) this.observeMessage(event.message);
  }

  observeToolEnd(event) {
    const activity = this.activeTurn.calls.get(event.toolCallId);
    if (!activity) return;
    activity.completed = true;
    activity.isError = event.isError === true;
    if (event.isError !== true && activity.toolName === "read" && typeof activity.args?.path === "string") {
      this.activeTurn.successfulReads.push(activity.args.path);
    }
  }

  observeMessage(message) {
    this.activeTurn.transcript.push(message);
    this.transcript.push(message);
    if (message.role !== "assistant") return;
    this.activeTurn.response = messageText(message);
    this.activeTurn.usage = mergeUsage(this.activeTurn.usage, message.usage);
    this.observedModel = {
      provider: message.provider ?? null,
      model: message.model ?? null,
    };
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      this.activeTurn.assistantError = message.errorMessage ?? `assistant stopped with ${message.stopReason}`;
    }
  }

  failProtocol(reason, details = {}) {
    this.protocolErrors.push({ reason, ...details });
    this.rejectWaiting(new Error(`Pi RPC protocol error: ${reason}`));
    this.requestTermination("protocol-error");
  }

  rejectWaiting(error) {
    for (const pending of this.pendingResponses.values()) pending.reject(error);
    this.pendingResponses.clear();
    this.activeTurn?.rejectSettled(error);
  }

  resetWatchdog() {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.requestTermination("no-progress-watchdog"), NO_PROGRESS_MS);
    this.watchdog.unref();
  }

  requestTermination(reason) {
    if (this.terminationReason !== null) return;
    this.terminationReason = reason;
    signalProcessTree(this.processGroupId, this.child, "SIGTERM");
    if (process.platform !== "win32") {
      this.forcedKillPromise = new Promise((resolve) => {
        this.forcedKill = setTimeout(() => {
          signalProcessTree(this.processGroupId, this.child, "SIGKILL");
          resolve();
        }, TERMINATION_GRACE_MS);
      });
    }
  }

  async finishProcess() {
    let exitCode = null;
    let exitSignal = null;
    try {
      const closedResult = await this.closed;
      exitCode = closedResult.exitCode;
      exitSignal = closedResult.exitSignal;
      await Promise.all([this.stdoutTask, this.stderrTask]);
    } catch (error) {
      this.operationError ??= error;
      this.requestTermination("process-error");
      await Promise.allSettled([this.stdoutTask, this.stderrTask]);
    } finally {
      clearTimeout(this.watchdog);
      await this.cleanupProcessTree();
      this.signal?.removeEventListener("abort", this.onAbort);
    }
    return { exitCode, exitSignal };
  }

  async cleanupProcessTree() {
    if (this.forcedKillPromise !== null) {
      if (processGroupExists(this.processGroupId)) await waitForForcedKill(this.forcedKillPromise);
      else clearTimeout(this.forcedKill);
      return;
    }
    if (!processGroupExists(this.processGroupId)) return;
    signalProcessTree(this.processGroupId, this.child, "SIGTERM");
    await waitForProcessTreeExit(this.processGroupId, this.child);
  }

  finalizeInterruptedTurn() {
    const turn = this.activeTurn;
    if (turn === null) return;
    const directlyObserved =
      turn.promptAccepted ||
      turn.settled ||
      turn.transcript.length > 0 ||
      turn.successfulReads.length > 0 ||
      turn.toolActivity.length > 0 ||
      turn.usage !== null ||
      turn.response !== "" ||
      turn.assistantError !== null;
    if (directlyObserved) this.turns.push(finishTurn(turn));
    this.activeTurn = null;
  }

  recordUnclassifiedProcessError() {
    if (this.operationError === null || this.terminationReason === "cancelled" || this.protocolErrors.length > 0) {
      return;
    }
    this.protocolErrors.push({
      reason: "process-error",
      message: this.operationError instanceof Error ? this.operationError.message : String(this.operationError),
    });
  }

  observation(prompts, exitCode, exitSignal) {
    return {
      exitCode,
      signal: exitSignal,
      settled: this.turns.length === prompts.length && this.turns.every((turn) => turn.settled),
      assistantError: this.turns.find((turn) => turn.assistantError !== null)?.assistantError ?? null,
      model: this.observedModel,
      terminationReason: this.terminationReason,
      parseErrors: this.parseErrors,
      protocolErrors: this.protocolErrors,
      turns: this.turns,
      transcript: this.transcript,
      response: this.turns.at(-1)?.response ?? "",
      usage: this.turns.reduce((total, turn) => mergeUsage(total, turn.usage), null),
    };
  }
}

function finishTurn(turn) {
  return {
    turn: turn.turn,
    prompt: turn.prompt,
    response: turn.response,
    transcript: turn.transcript,
    successfulReads: turn.successfulReads,
    toolActivity: turn.toolActivity,
    promptAccepted: turn.promptAccepted,
    usage: turn.usage,
    assistantError: turn.assistantError,
    settled: turn.settled,
  };
}
