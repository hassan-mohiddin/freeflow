import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { freeflowHome } from "../messaging/registry.js";
export const REQUESTS = [
  "pin",
  "inject",
  "forget",
  "compact",
  "checkpoint",
  "rewind",
  "route",
  "spawn",
  "send",
  "wake",
  "ask",
  "block",
  "sensors",
  "timers",
];
const FLUSH_MS = 5_000;
/** How long after a run settles the lines wait for the session to stay idle before they are written. */
export const IDLE_FLUSH_MS = 2_000;
/** Pi's file tools, whose `path` the line names. */
const FILE_TOOLS = new Set(["read", "edit", "write", "apply_patch", "ls", "find", "grep"]);
/** Pi's session-start reasons as schema v1 names them; a reload goes on with the same session, as a resume does. */
const SOURCES = {
  startup: "startup",
  resume: "resume",
  reload: "resume",
  new: "clear",
  fork: "fork",
};
/** The requests Pi's extension claims (section 4.5): yes only for what it carries out now, with a test. */
export function piClaims(inputs) {
  const claim = (value, how) => ({ claim: value, how });
  if (!inputs.enabled)
    return Object.fromEntries(
      REQUESTS.map((request) => [request, claim("no", "Freeflow is off in this session (enabled)")]),
    );
  return {
    pin: claim("yes", "before_agent_start sections"),
    inject: claim("yes", "sendMessage, steered into the run or on the next turn"),
    forget: inputs.routing
      ? claim("yes", "Cognitive Routing's projection in context_with_system (the request only)")
      : claim("possible", "context_with_system can drop messages from a request; Cognitive Routing is off"),
    compact: inputs.compaction
      ? claim("yes", "its own compaction after a checkpoint, the bundle in place of the summary")
      : claim("possible", "Freeflow's compaction is off (compaction.enabled)"),
    checkpoint: claim("yes", "through Track Work's script"),
    rewind: claim("no", "the session tree is observed only"),
    route: inputs.routing
      ? claim("yes", "Cognitive Routing's setModel and setThinkingLevel")
      : claim("possible", "setModel and setThinkingLevel exist; Cognitive Routing is off"),
    spawn: claim("no", "Pi's extension starts no agent"),
    send: inputs.messaging
      ? claim("yes", "Messaging's sockets between Pi sessions on this machine")
      : claim("possible", "Messaging is off (messaging.enabled)"),
    wake: inputs.compaction
      ? claim("yes", "the run continues after its compaction")
      : claim("possible", "sendUserMessage exists; Freeflow wakes the run only after its compaction, which is off"),
    ask: inputs.askUser ? claim("yes", "the ask_user tool") : claim("no", "no person to ask in a subagent"),
    block: claim(
      "yes",
      "tool_call returns a block with its reason: the gates under block (gates.*), Tool Execution's guards",
    ),
    sensors: inputs.events
      ? claim("yes", "runs, turns, model requests, tool calls and compactions, written to the event log")
      : claim("possible", "the event log is off (events.enabled)"),
    timers: claim("yes", "Node timers"),
  };
}
/** A file tool's path as the line names it: relative to the session's folder when inside it. */
export function eventPath(path, cwd) {
  const full = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
  const base = resolve(cwd);
  return full.startsWith(base + sep) ? relative(base, full).split(sep).join("/") : full;
}
/** A shell command's exit code, where Pi gives one: only as text, "Command exited with code N". */
export function exitCode(content) {
  const text = Array.isArray(content)
    ? content.map((block) => (typeof block?.text === "string" ? block.text : "")).join("\n")
    : typeof content === "string"
      ? content
      : "";
  const match = /Command exited with code (-?\d+)/.exec(text);
  return match ? Number(match[1]) : undefined;
}
export class EventRecorder {
  run;
  now;
  buffered = [];
  dropped = 0;
  session;
  on = false;
  claimsWritten;
  flushing = Promise.resolve();
  turns = 0;
  turnStarted;
  started = new Map();
  idleTimer;
  constructor(run, now = Date.now) {
    this.run = run;
    this.now = now;
  }
  /** A session starts (or reloads): lines are kept while Freeflow and its event log are on. */
  begin(session, on) {
    this.session = session;
    this.on = on;
    this.turns = 0;
    this.turnStarted = undefined;
    this.started.clear();
    this.claimsWritten = undefined;
  }
  /** The event log's switch, as settings change during the session. */
  setOn(on) {
    this.on = on;
  }
  /** Keeps one line for the next flush. */
  emit(kind, fields = {}) {
    if (!this.on || !this.session) return;
    const line = {
      v: 1,
      ts: new Date(this.now()).toISOString(),
      session: this.session,
      harness: "pi",
      agent: "main",
      kind,
    };
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) line[key] = value;
    this.buffered.push(line);
  }
  sessionStarted(reason, interactive) {
    this.emit("session.start", { source: SOURCES[reason ?? "startup"] ?? "startup", interactive });
  }
  turnStart() {
    this.turns += 1;
    this.turnStarted = this.now();
    this.emit("turn.start", { turn: this.turns });
  }
  turnEnd(stopReason) {
    const reason =
      stopReason === "aborted" ? "aborted" : stopReason === "error" ? "error" : stopReason ? "answer" : undefined;
    const ms = this.turnStarted === undefined ? undefined : Math.max(0, Math.round(this.now() - this.turnStarted));
    this.emit("turn.end", { turn: this.turns || undefined, reason, ms });
  }
  /** An assistant message with its usage: one model request. */
  modelRequest(message, thinkingLevel) {
    const usage = message?.usage;
    if (!usage || typeof message?.model !== "string" || !message.model) return;
    const count = (value) => (Number.isInteger(value) && value >= 0 ? value : undefined);
    const [input, output, read, written] = [usage.input, usage.output, usage.cacheRead, usage.cacheWrite].map(count);
    this.emit("model.request", {
      model: message.model,
      effort: typeof thinkingLevel === "string" && thinkingLevel ? thinkingLevel : null,
      in: input,
      out: output,
      cacheRead: read,
      cacheWrite: written,
      context: (input ?? 0) + (read ?? 0) + (written ?? 0),
      stop: typeof message.stopReason === "string" && message.stopReason ? message.stopReason : undefined,
    });
  }
  toolCall(id) {
    if (typeof id === "string") this.started.set(id, this.now());
  }
  /** A tool's result: its line, Freeflow's own when it runs a script from Freeflow's package or touches the store. */
  toolResult(event, cwd, ours) {
    const id = typeof event?.toolCallId === "string" ? event.toolCallId : undefined;
    const started = id === undefined ? undefined : this.started.get(id);
    if (id !== undefined) this.started.delete(id);
    const input = event?.input ?? {};
    const tool = String(event?.toolName ?? "");
    if (!tool) return;
    const named = FILE_TOOLS.has(tool)
      ? [input.path, input.file_path].filter((path) => typeof path === "string" && path !== "")
      : [];
    const command = tool === "bash" && typeof input.command === "string" ? input.command : undefined;
    this.emit("tool.call", {
      tool,
      ok: event?.isError !== true,
      exit: command === undefined ? undefined : exitCode(event?.content),
      ms: started === undefined ? undefined : Math.max(0, Math.round(this.now() - started)),
      paths: named.length ? named.map((path) => eventPath(path, cwd)) : undefined,
      command,
      source: ours ? "freeflow" : "agent",
    });
  }
  compaction(by, trigger) {
    this.emit("compaction", { by, trigger });
  }
  freeflow(what, detail) {
    this.emit("freeflow", { what, detail });
  }
  sessionEnded(reason) {
    this.emit("session.end", { reason: typeof reason === "string" && reason ? reason : undefined });
  }
  /** The session the lines and claims are for. */
  sessionId() {
    return this.session;
  }
  /** Lines waiting to be written. */
  pending() {
    return this.buffered.length;
  }
  /**
   * A run settled: the lines are written once the session has stayed idle a moment, so starting the script's process
   * never lands in a run (T3). A run that starts first takes them along, to the next settle or the shutdown.
   */
  settled() {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      void this.flush();
    }, IDLE_FLUSH_MS);
    this.idleTimer.unref?.();
  }
  /** A run starts: no flush in the middle of it. */
  runStarted() {
    this.cancelIdle();
  }
  cancelIdle() {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
  /** Writes the waiting lines with one script run, after any flush still running; never throws. */
  flush() {
    this.cancelIdle();
    this.flushing = this.flushing.then(() => this.write());
    return this.flushing;
  }
  async write() {
    if (!this.buffered.length) return;
    const lines = this.buffered;
    this.buffered = [];
    const { v, ts, session, harness } = lines[0];
    const note = this.dropped
      ? [{ v, ts, session, harness, agent: "main", kind: "freeflow", what: "dropped", dropped: this.dropped }]
      : [];
    try {
      const ran = await this.run(["events", "append", "--input", "-"], {
        input: [...note, ...lines].map((line) => JSON.stringify(line)).join("\n"),
        timeoutMs: FLUSH_MS,
      });
      if (ran.code !== 0) throw new Error(ran.stderr.replace(/^Error: /, "").trim() || `exit code ${ran.code}`);
      this.dropped = 0;
    } catch {
      this.dropped += lines.length;
    }
  }
  /**
   * Writes the session's claims when they changed since the last write (T4). Not awaited by its callers: a file
   * write, off the request path.
   */
  async writeClaims(inputs, version) {
    if (!this.session) return;
    const file = {
      v: 1,
      requestSet: 1,
      driver: "pi-extension",
      freeflow: version ?? null,
      mode: "interactive",
      enabled: inputs.enabled,
      events: inputs.enabled && inputs.events,
      claims: piClaims(inputs),
    };
    const text = `${JSON.stringify(file, null, 2)}\n`;
    if (text === this.claimsWritten) return;
    this.claimsWritten = text;
    // Its line where the claims changed, not where the disk finished.
    this.freeflow("capabilities", file.mode);
    const folder = join(resolve(freeflowHome()), "sessions", this.session);
    try {
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "capabilities.json"), text);
    } catch {
      // A home that cannot be written: the claims read as none, and every request as no.
      this.claimsWritten = undefined;
    }
  }
}
