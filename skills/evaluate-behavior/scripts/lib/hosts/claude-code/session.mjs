// A Claude Code process in headless stream-json mode: the evaluator writes each prompt as a user message on stdin,
// reads Claude Code's events from stdout, and sends the next prompt after each turn's `result`. Events are kept as
// Claude Code wrote them (events.jsonl) and normalized into the observation every host returns (see subject.mjs):
// tool calls under the evaluator's tool names, with Claude Code's own names and arguments kept beside them.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import path from "node:path";
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
} from "../../process.mjs";
import { startRecorder } from "./recorder.mjs";
import { readSkill, skillCommandPrompt } from "./skills.mjs";

// Claude Code's tool names, the evaluator's, and the argument holding the path. Glob is find when the group declared
// find, and ls otherwise.
const TOOL_NAMES = { Read: "read", Write: "write", Edit: "edit", Grep: "grep", Bash: "bash" };
const PATH_ARGUMENT = { Read: "file_path", Write: "file_path", Edit: "file_path", Glob: "path", Grep: "path" };

/** The evaluator's name and arguments for one of Claude Code's tool calls. */
export function evaluatorToolCall(name, input, declaredTools) {
  const toolName =
    name === "Glob"
      ? declaredTools.includes("find") || !declaredTools.includes("ls")
        ? "find"
        : "ls"
      : TOOL_NAMES[name];
  const key = PATH_ARGUMENT[name];
  let args = input ?? null;
  if (key !== undefined && args !== null && typeof args === "object") {
    const { [key]: value, ...rest } = args;
    args = value === undefined ? rest : { path: value, ...rest };
  }
  return { toolName: toolName ?? name, args };
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function usageFrom(result, previousCost) {
  const usage = result.usage ?? {};
  const cost = typeof result.total_cost_usd === "number" ? Math.max(0, result.total_cost_usd - previousCost) : 0;
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost },
  };
}

/** A persistent session over the declared prompts, then any `nextPrompt` replies. */
export async function runClaudeSession(options) {
  return new ClaudeSession(options).run(options.prompts, options.targetPath ?? null);
}

/** One prompt, reported as a one-shot run: the first turn's reads and tool calls at the top level. */
export async function runClaudeOneShot(options) {
  const observation = await new ClaudeSession(options).run(options.prompts, null);
  const turn = observation.turns[0];
  const { turns: _turns, delivery: _delivery, ...rest } = observation;
  return { ...rest, successfulReads: turn?.successfulReads ?? [], toolActivity: turn?.toolActivity ?? [] };
}

class ClaudeSession {
  constructor({
    subject = null,
    command = "claude",
    args,
    cwd,
    eventsFile,
    stderrFile,
    signal,
    environment,
    afterTurn = null,
    nextPrompt = null,
    record = subject === null
      ? null
      : {
          observationPath: subject.requiresContextObservation ? subject.contextObservationPath : null,
          hostContextPath: path.join(path.dirname(eventsFile), "host-context.json"),
        },
  }) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.environment = environment;
    this.record = record;
    this.signal = signal;
    this.afterTurn = afterTurn;
    this.nextPrompt = nextPrompt;
    this.eventsFile = eventsFile;
    this.stderrFile = stderrFile;
    const tools = argumentValue(args, "--tools");
    this.expectedTools = tools === undefined || tools === "" ? [] : tools.split(",");
    this.declaredTools = JSON.parse(environment.SKILL_EVAL_ALLOWED_TOOLS ?? "[]");
    this.turns = [];
    this.transcript = [];
    this.parseErrors = [];
    this.protocolErrors = [];
    this.activeTurn = null;
    this.turnNumber = 0;
    this.init = null;
    this.observedModel = null;
    this.reportedCost = 0;
    this.terminationReason = null;
    this.operationError = null;
    this.decoder = new StringDecoder("utf8");
    this.buffer = "";
    this.eventLine = 0;
    this.watchdog = undefined;
    this.forcedKill = undefined;
    /** @type {Promise<void> | null} */
    this.forcedKillPromise = null;
  }

  async start() {
    let environment = this.environment;
    if (this.record !== null) {
      this.recorder = await startRecorder({
        upstream: this.environment.ANTHROPIC_BASE_URL,
        observationPath: this.record.observationPath,
        hostContextPath: this.record.hostContextPath,
        currentTurn: () => this.turnNumber,
      });
      // The relay is on this machine, so a proxy the machine uses must not stand between them.
      const noProxy = [this.environment.NO_PROXY, "127.0.0.1", "localhost"].filter(Boolean).join(",");
      environment = { ...environment, ANTHROPIC_BASE_URL: this.recorder.url, NO_PROXY: noProxy, no_proxy: noProxy };
    }
    this.child = spawn(this.command, this.args, {
      cwd: this.cwd,
      detached: process.platform !== "win32",
      env: environment,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.processGroupId = this.child.pid;
    this.events = createWriteStream(this.eventsFile, { encoding: "utf8" });
    this.stderr = createWriteStream(this.stderrFile, { encoding: "utf8" });
    this.onAbort = () => this.requestTermination("cancelled");
    if (this.signal?.aborted) this.onAbort();
    else this.signal?.addEventListener("abort", this.onAbort, { once: true });
    this.resetWatchdog();
    this.closed = new Promise((resolve, reject) => {
      this.child.once("error", reject);
      this.child.once("close", (exitCode, exitSignal) => {
        this.activeTurn?.rejectSettled(new Error("Claude Code exited before the turn completed"));
        resolve({ exitCode, exitSignal });
      });
    });
    // A write to a process that already exited is reported by its exit, not as an unhandled error.
    this.child.stdin.on("error", () => {});
    this.stderrTask = pipeStream(this.child.stderr, this.stderr, () => this.resetWatchdog());
    this.stdoutTask = this.readStdout();
  }

  async run(prompts, targetPath) {
    let deliveredPrompts = [...prompts];
    /** @type {any} */
    let delivery = { kind: "unavailable", turn: 1, targetPath };
    try {
      if (targetPath !== null) {
        // Claude Code's skill loader stays off, so the target skill arrives as Pi's skill command would expand it.
        const skill = await readSkill(path.dirname(targetPath));
        deliveredPrompts = [skillCommandPrompt(skill, prompts[0]), ...prompts.slice(1)];
        delivery = { kind: "explicit-skill-command", turn: 1, targetPath, command: `skill:${skill.name}` };
      }
      await this.start();
      for (let index = 0; index < deliveredPrompts.length; index += 1) {
        if (this.signal?.aborted || this.terminationReason !== null) break;
        if (delivery.kind === "unavailable") delivery = { kind: "natural-prompt", turn: 1, targetPath: null };
        const turn = await this.runTurn(index + 1, deliveredPrompts[index]);
        this.turns.push(turn);
        if (this.afterTurn !== null) turn.workspace = await this.afterTurn(turn.turn);
        if (turn.assistantError !== null) break;
        if (this.nextPrompt !== null && index === deliveredPrompts.length - 1 && this.terminationReason === null) {
          const next = await this.nextPrompt(this.turns);
          // The simulated user's time is not the subject's lack of progress.
          this.resetWatchdog();
          if (typeof next === "string") deliveredPrompts.push(next);
        }
      }
    } catch (error) {
      this.operationError = error;
      if (this.terminationReason === null) {
        this.protocolErrors.push({
          reason: "operation-failed",
          message: error instanceof Error ? error.message : String(error),
        });
        if (this.child !== undefined) this.requestTermination("protocol-error");
      }
    } finally {
      if (this.child !== undefined && !this.child.stdin.destroyed) this.child.stdin.end();
    }

    const { exitCode, exitSignal } =
      this.child === undefined ? { exitCode: null, exitSignal: null } : await this.finish();
    this.finalizeInterruptedTurn();
    this.recordUnclassifiedProcessError();
    return { ...this.observation(deliveredPrompts, exitCode, exitSignal), delivery };
  }

  async runTurn(turnNumber, prompt) {
    let resolveSettled;
    let rejectSettled;
    const settlement = new Promise((resolve, reject) => {
      resolveSettled = resolve;
      rejectSettled = reject;
    });
    // Awaited below; a rejection that arrives while the prompt is still being written is handled there.
    settlement.catch(() => {});
    this.turnNumber = turnNumber;
    this.activeTurn = {
      turn: turnNumber,
      prompt,
      response: "",
      transcript: [],
      messages: new Map(),
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
    const entry = { role: "user", content: prompt };
    this.activeTurn.transcript.push(entry);
    this.transcript.push(entry);
    this.resetWatchdog();
    const message = { type: "user", message: { role: "user", content: prompt } };
    await writeStream(this.child.stdin, `${JSON.stringify(message)}\n`);
    await settlement;
    const result = finishTurn(this.activeTurn);
    this.activeTurn = null;
    return result;
  }

  async readStdout() {
    for await (const chunk of this.child.stdout) {
      this.resetWatchdog();
      this.buffer += this.decoder.write(chunk);
      while (true) {
        const newline = this.buffer.indexOf("\n");
        if (newline === -1) break;
        const line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        await writeStream(this.events, `${line}\n`);
        this.observeLine(line.endsWith("\r") ? line.slice(0, -1) : line);
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
    if (line.trim() === "") return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      this.parseErrors.push({ line: this.eventLine, reason: "invalid-json" });
      this.failProtocol("invalid-json", { line: this.eventLine });
      return;
    }
    if (event.type === "system" && event.subtype === "init") this.observeInit(event);
    else if (this.activeTurn === null) return;
    else if (event.type === "assistant") this.observeAssistant(event.message);
    else if (event.type === "user") this.observeUser(event.message);
    else if (event.type === "result") this.observeResult(event);
  }

  // Claude Code reports what it loaded; anything beyond the declared tools, or any MCP server, voids the run.
  observeInit(event) {
    this.init = {
      version: event.claude_code_version ?? null,
      model: event.model ?? null,
      tools: event.tools ?? [],
      mcpServers: event.mcp_servers ?? [],
      skills: event.skills ?? [],
      slashCommands: event.slash_commands ?? [],
      agents: event.agents ?? [],
      plugins: event.plugins ?? [],
      permissionMode: event.permissionMode ?? null,
      apiKeySource: event.apiKeySource ?? null,
      outputStyle: event.output_style ?? null,
    };
    const tools = Array.isArray(event.tools) ? event.tools : [];
    const extra = tools.filter((tool) => !this.expectedTools.includes(tool));
    const missing = this.expectedTools.filter((tool) => !tools.includes(tool));
    if (extra.length > 0 || missing.length > 0) this.failProtocol("host-tools-differ", { extra, missing });
    if (Array.isArray(event.mcp_servers) && event.mcp_servers.length > 0) {
      this.failProtocol("undeclared-mcp-servers", { servers: event.mcp_servers.map((server) => server?.name ?? null) });
    }
  }

  // Claude Code reports each content block of an assistant message as its own event; they are one message.
  observeAssistant(message) {
    if (!message || typeof message !== "object") return;
    const turn = this.activeTurn;
    turn.promptAccepted = true;
    this.observedModel = { provider: "anthropic", model: message.model ?? null };
    let entry = typeof message.id === "string" ? turn.messages.get(message.id) : undefined;
    if (entry === undefined) {
      entry = { role: "assistant", id: message.id ?? null, model: message.model ?? null, content: [] };
      if (typeof message.id === "string") turn.messages.set(message.id, entry);
      turn.transcript.push(entry);
      this.transcript.push(entry);
    }
    entry.stopReason = message.stop_reason ?? entry.stopReason ?? null;
    for (const block of Array.isArray(message.content) ? message.content : []) {
      entry.content.push(block);
      if (block?.type !== "tool_use") continue;
      const { toolName, args } = evaluatorToolCall(block.name, block.input, this.declaredTools);
      const activity = {
        toolCallId: block.id ?? null,
        toolName,
        args,
        hostToolName: block.name ?? null,
        hostArgs: block.input ?? null,
        completed: false,
        isError: null,
      };
      turn.toolActivity.push(activity);
      if (typeof block.id === "string") turn.calls.set(block.id, activity);
    }
  }

  observeUser(message) {
    if (!message || typeof message !== "object") return;
    const turn = this.activeTurn;
    const entry = { role: "user", content: message.content };
    turn.transcript.push(entry);
    this.transcript.push(entry);
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block?.type !== "tool_result") continue;
      const activity = turn.calls.get(block.tool_use_id);
      if (!activity) continue;
      activity.completed = true;
      activity.isError = block.is_error === true;
      if (!activity.isError && activity.toolName === "read" && typeof activity.args?.path === "string") {
        turn.successfulReads.push(activity.args.path);
      }
    }
  }

  observeResult(event) {
    const turn = this.activeTurn;
    if (turn.settled) {
      this.failProtocol("unexpected-result", { line: this.eventLine });
      return;
    }
    turn.promptAccepted = true;
    turn.usage = usageFrom(event, this.reportedCost);
    if (typeof event.total_cost_usd === "number") this.reportedCost = event.total_cost_usd;
    const lastAssistant = turn.transcript.filter((message) => message.role === "assistant").at(-1);
    turn.response = typeof event.result === "string" ? event.result : lastAssistant ? messageText(lastAssistant) : "";
    if (event.is_error === true || event.subtype !== "success") {
      turn.assistantError =
        (typeof event.result === "string" && event.result !== "" ? event.result : null) ??
        (event.api_error_status ? `API error ${event.api_error_status}` : `Claude Code stopped with ${event.subtype}`);
    }
    turn.settled = true;
    turn.resolveSettled();
  }

  failProtocol(reason, details = {}) {
    this.protocolErrors.push({ reason, ...details });
    this.activeTurn?.rejectSettled(new Error(`Claude Code protocol error: ${reason}`));
    this.requestTermination("protocol-error");
  }

  resetWatchdog() {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => this.requestTermination("no-progress-watchdog"), NO_PROGRESS_MS);
    this.watchdog.unref();
  }

  requestTermination(reason) {
    if (this.terminationReason !== null) return;
    this.terminationReason = reason;
    this.activeTurn?.rejectSettled(new Error(`Claude Code session terminated: ${reason}`));
    if (this.child === undefined) return;
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

  async finish() {
    let exitCode = null;
    let exitSignal = null;
    try {
      const closed = await this.closed;
      exitCode = closed.exitCode;
      exitSignal = closed.exitSignal;
      await Promise.all([this.stdoutTask, this.stderrTask]);
    } catch (error) {
      this.operationError ??= error;
      this.requestTermination("process-error");
      await Promise.allSettled([this.stdoutTask, this.stderrTask]);
    } finally {
      clearTimeout(this.watchdog);
      if (this.forcedKillPromise !== null) {
        if (processGroupExists(this.processGroupId)) await waitForForcedKill(this.forcedKillPromise);
        else clearTimeout(this.forcedKill);
      } else if (processGroupExists(this.processGroupId)) {
        signalProcessTree(this.processGroupId, this.child, "SIGTERM");
        await waitForProcessTreeExit(this.processGroupId, this.child);
      }
      this.signal?.removeEventListener("abort", this.onAbort);
      await this.recorder?.close({ init: this.init });
    }
    return { exitCode, exitSignal };
  }

  finalizeInterruptedTurn() {
    const turn = this.activeTurn;
    if (turn === null) return;
    const observed = turn.promptAccepted || turn.settled || turn.transcript.length > 0 || turn.toolActivity.length > 0;
    if (observed) this.turns.push(finishTurn(turn));
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
      host: this.init,
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
