import { randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

export const BASH_BACKGROUND = "bash_background";
export const MONITOR = "monitor";
export const STOP_BACKGROUND = "stop_background";
export const NOTICE_TYPE = "freeflow-background";
export const MONITOR_TYPE = "freeflow-monitor";
/** Background commands and monitors together. */
export const MAX_RUNNING = 16;
export const MONITOR_DEFAULT_MS = 5 * 60_000;
export const MONITOR_MAX_MS = 30 * 60_000;
/** Event notices a monitor may send per minute before it is stopped; each one can start a model turn. */
export const MONITOR_PER_MINUTE = 20;
/** Lines one event notice shows; the rest stay in the output file. */
export const MONITOR_MAX_LINES = 40;
const MAX_LINE_CHARS = 1_000;
/** Marks harness messages, which arrive on their own schedule, as not written by the user. */
import { freeflowNotice } from "../host/inbound.js";

export { freeflowNotice };

type Status = "running" | "completed" | "failed" | "stopped";

interface Job {
  id: string;
  kind: "command" | "monitor";
  label: string;
  outputPath: string;
  controller: AbortController;
  status: Status;
  exitCode?: number;
  /** Lines a monitor has delivered as events. */
  events: number;
  /**
   * Set before the job's signal is aborted. A stop by the tool or at session end sends no notice (the stop's own
   * result reports it); a monitor that expired or passed its rate limit gets one notice saying so.
   */
  stopping?: "tool" | "shutdown" | "expired" | "limit";
  /** Settles after the process exited and the output file is closed. */
  done: Promise<void>;
  /** The process has ended: a limit reached while its last lines are delivered no longer stops it. */
  ended?: boolean;
}

export interface BackgroundHost {
  /** Whether Tool Execution is effective now. */
  effective(): boolean;
  /** Pi's `shellPath` setting, so background commands run in the same shell as `bash`. */
  shellPath(): string | undefined;
  /** Deliver an exit notice or restatement as a message after what the model already received. */
  send(content: string, details: Record<string, unknown>, triggerTurn: boolean): void;
  /**
   * Deliver one line a monitor printed. Lines of one monitor within the batching window join one notice (`join`
   * gives its text); past MONITOR_PER_MINUTE notices a minute `onLimit` is called once and later lines are dropped.
   */
  event(id: string, line: string, join: (lines: string[]) => string, onLimit: () => void): void;
  /** Deliver a monitor's pending lines now and forget its batching state, before its end notice. */
  endEvents(id: string): void;
  /** Drop a monitor's pending lines and batching state: the session is ending. */
  discardEvents?(id: string): void;
}

const newId = (prefix: string) => `${prefix}${randomBytes(6).readUIntBE(0, 6).toString(36).slice(-6).padStart(6, "0")}`;
const shellQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

function labelFor(command: string, description?: string): string {
  const text = description?.trim() || command.trim().split("\n")[0];
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function close(stream: WriteStream, trailer: string): Promise<void> {
  return new Promise((resolve) => {
    stream.once("error", () => resolve());
    stream.end(trailer, () => resolve());
  });
}

/**
 * Claude Code's background commands on Pi's shell backend: start and return at once, stream output to one file,
 * notify the model when the command exits, stop on request or when the session ends.
 */
export class BackgroundJobs {
  private jobs = new Map<string, Job>();
  /** Launches between their check of MAX_RUNNING and their job's registration. */
  private starting = 0;
  /** Changes when the session ends, so a launch that was still starting then does not run. */
  private generation = 0;

  constructor(private readonly host: BackgroundHost) {}

  running(): Job[] {
    return [...this.jobs.values()].filter((job) => job.status === "running");
  }

  async start(command: string, description: string | undefined, cwd: string, sessionId: string) {
    return this.launch("command", command, description, cwd, sessionId);
  }

  /**
   * Claude Code's Monitor: each line the command prints to stdout is an event for the model, batched by the host;
   * stderr goes to the output file only. One notice when the command exits, expires, or is stopped for sending too
   * much.
   */
  async monitor(command: string, description: string, timeoutMs: number, cwd: string, sessionId: string) {
    const ms = Math.min(Math.max(Math.round(timeoutMs) || MONITOR_DEFAULT_MS, 1_000), MONITOR_MAX_MS);
    return this.launch("monitor", command, description, cwd, sessionId, ms);
  }

  private async launch(
    kind: Job["kind"],
    command: string,
    description: string | undefined,
    cwd: string,
    sessionId: string,
    timeoutMs?: number,
  ) {
    if (this.running().length + this.starting >= MAX_RUNNING)
      throw new Error(`${MAX_RUNNING} background commands are running. Stop one with stop_background, then retry.`);
    const prefix = kind === "monitor" ? "mon" : "bg";
    let id = newId(prefix);
    while (this.jobs.has(id)) id = newId(prefix);
    const generation = this.generation;
    const folder = join(tmpdir(), "freeflow", sessionId.replace(/[^A-Za-z0-9._-]/g, "_"), "background");
    const outputPath = join(folder, `${id}.output`);
    // A monitor's stderr is appended to the same file by the shell, so both writers append.
    let stream!: WriteStream;
    this.starting++;
    try {
      await mkdir(folder, { recursive: true, mode: 0o700 });
      stream = createWriteStream(outputPath, { flags: kind === "monitor" ? "a" : "w", mode: 0o600 });
      await new Promise<void>((resolve, reject) => {
        stream.once("open", () => resolve());
        stream.once("error", reject);
      });
    } finally {
      this.starting--;
    }
    if (generation !== this.generation) {
      await close(stream, "[not started: the session ended]\n");
      throw new Error("The session ended before the command started.");
    }
    const controller = new AbortController();
    let endsWithNewline = true;
    const job: Job = {
      id,
      kind,
      label: labelFor(command, description),
      outputPath,
      controller,
      status: "running",
      events: 0,
      done: Promise.resolve(),
    };
    let partial = "";
    // One decoder per job, so a character split across two reads is decoded whole.
    const decoder = new StringDecoder("utf8");
    const event = (line: string) => {
      job.events++;
      const text = line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}... (line cut)` : line;
      this.host.event(
        id,
        text,
        (lines) => this.eventText(job, lines),
        () => this.halt(job, "limit"),
      );
    };
    const script = kind === "monitor" ? `{\n${command}\n} 2>>${shellQuote(outputPath)}` : command;
    const run = createLocalBashOperations({ shellPath: this.host.shellPath() }).exec(script, cwd, {
      onData: (data) => {
        if (data.length === 0) return;
        endsWithNewline = data[data.length - 1] === 10;
        stream.write(data);
        if (kind !== "monitor" || job.stopping) return;
        const lines = (partial + decoder.write(data)).split("\n");
        // An unfinished line keeps only what a terminal would show (the text after its last carriage return), so a
        // progress bar redrawn with \r does not grow it without bound; the output file has everything.
        partial = (lines.pop() ?? "")
          .split("\r")
          .at(-1)!
          .slice(-4 * MAX_LINE_CHARS);
        for (const line of lines) if (line.trim() !== "") event(line.replace(/\r$/, ""));
      },
      signal: controller.signal,
    });
    const timer =
      timeoutMs === undefined ? undefined : setTimeout(() => this.halt(job, "expired"), timeoutMs).unref?.();
    const finish = () => {
      if (timer) clearTimeout(timer as ReturnType<typeof setTimeout>);
      job.ended = true;
      if (kind !== "monitor") return;
      partial += decoder.end();
      if (partial.trim() !== "" && !job.stopping) event(partial);
      partial = "";
      if (job.stopping === "shutdown" && this.host.discardEvents) this.host.discardEvents(id);
      else this.host.endEvents(id);
    };
    job.done = run.then(
      async ({ exitCode }) => {
        finish();
        const code = exitCode ?? 1;
        job.exitCode = code;
        job.status = code === 0 ? "completed" : "failed";
        await close(stream, `${endsWithNewline ? "" : "\n"}[exited with code ${code}]\n`);
        this.notify(job);
      },
      async (error) => {
        finish();
        const lead = endsWithNewline ? "" : "\n";
        if (job.stopping) {
          job.status = "stopped";
          const trailer =
            job.stopping === "tool"
              ? "[stopped]"
              : job.stopping === "shutdown"
                ? "[stopped at session end]"
                : job.stopping === "expired"
                  ? "[stopped: timeout]"
                  : "[stopped: too many events]";
          await close(stream, `${lead}${trailer}\n`);
          if (job.stopping === "expired" || job.stopping === "limit") this.notify(job);
          return;
        }
        // The command could not run (for example, the working directory is gone).
        job.status = "failed";
        const message = error instanceof Error ? error.message : String(error);
        await close(stream, `${lead}[failed to run: ${message}]\n`);
        this.notify(job, message);
      },
    );
    this.jobs.set(id, job);
    return { id, outputPath, ...(timeoutMs === undefined ? {} : { timeoutMs }) };
  }

  /** Stop a monitor on its own account: its timeout passed, or it sent more than its rate limit allows. */
  private halt(job: Job, reason: "expired" | "limit"): void {
    if (job.status !== "running" || job.stopping || job.ended) return;
    job.stopping = reason;
    job.controller.abort();
  }

  private eventText(job: Job, lines: string[]): string {
    const shown = lines.slice(0, MONITOR_MAX_LINES);
    const more = lines.length - shown.length;
    return freeflowNotice(
      "monitor",
      [
        `Monitor ${job.id} (${job.label}):`,
        ...shown,
        ...(more > 0 ? [`... ${more} more lines in ${job.outputPath}`] : []),
      ].join("\n"),
    );
  }

  async stop(id: string) {
    const job = this.jobs.get(id);
    if (!job) {
      const running = this.running().map((each) => each.id);
      throw new Error(
        `No background command ${id} in this session. Running: ${running.length > 0 ? running.join(", ") : "none"}.`,
      );
    }
    if (job.status === "running" && !job.stopping) {
      job.stopping = "tool";
      job.controller.abort();
    }
    await job.done;
    if (job.stopping === "tool" && job.status === "stopped")
      return { text: `Stopped ${id}.`, structured: { id, status: "stopped" } };
    const exited =
      job.exitCode === undefined
        ? `${id} already ${job.status === "stopped" ? "stopped" : "failed to run"}. Output: ${job.outputPath}.`
        : `${id} already exited with code ${job.exitCode}. Output: ${job.outputPath}.`;
    return {
      text: exited,
      structured: { id, status: job.status, ...(job.exitCode === undefined ? {} : { exitCode: job.exitCode }) },
    };
  }

  /** Session end: stop every running job, wait for the processes to exit, forget them. No notice is sent. */
  async stopAll(): Promise<void> {
    this.generation++;
    const running = this.running();
    for (const job of running) {
      job.stopping = "shutdown";
      job.controller.abort();
    }
    await Promise.all(running.map((job) => job.done));
    this.jobs = new Map();
  }

  /** After compaction the model may no longer see which commands it started; restate the running ones once. */
  restate(): void {
    const running = this.running();
    if (running.length === 0) return;
    const list = running
      .map((job) => `${job.kind === "monitor" ? "monitor " : ""}${job.id} (${job.label}), output ${job.outputPath}`)
      .join("; ");
    this.host.send(
      freeflowNotice(
        "background",
        `Still running: ${list}. Do not start them again; stop one with stop_background before restarting it.`,
      ),
      { running: running.map((job) => ({ id: job.id, outputPath: job.outputPath })) },
      false,
    );
  }

  private notify(job: Job, runError?: string): void {
    if (job.stopping === "tool" || job.stopping === "shutdown") return;
    const details = {
      id: job.id,
      ...(job.kind === "monitor" ? { kind: job.kind } : {}),
      status: job.status,
      ...(job.exitCode === undefined ? {} : { exitCode: job.exitCode }),
      ...(job.kind === "monitor" ? { events: job.events } : {}),
      outputPath: job.outputPath,
    };
    if (job.kind === "monitor") {
      const events = `${job.events} ${job.events === 1 ? "event" : "events"}`;
      const outcome =
        job.stopping === "expired"
          ? `reached its timeout after ${events} and was stopped. Start it again to keep watching.`
          : job.stopping === "limit"
            ? `was stopped after ${events}: it sent more than ${MONITOR_PER_MINUTE} notices in a minute. Filter its output to the lines you would act on, then start it again.`
            : runError !== undefined
              ? `failed to run: ${runError}.`
              : `exited with code ${job.exitCode} after ${events}.`;
      this.host.send(
        freeflowNotice("monitor", `Monitor ${job.id} (${job.label}) ${outcome} Output: ${job.outputPath}.`),
        details,
        true,
      );
      return;
    }
    const outcome =
      runError !== undefined
        ? `failed to run: ${runError}`
        : job.status === "completed"
          ? "completed"
          : `failed with exit code ${job.exitCode}`;
    this.host.send(
      freeflowNotice(
        "background",
        `Background command ${job.id} (${job.label}) ${outcome}. Output: ${job.outputPath}.`,
      ),
      details,
      true,
    );
  }
}

const START_DESCRIPTION = [
  "Run a shell command in the background. Use it for servers, watchers and commands expected to run longer than two minutes. Returns an ID and an output file at once; you are notified once, when the command exits. Read the output file for output so far.",
  "To be notified when something becomes ready, run a command that exits when it is: until grep -qE 'Listening|Error|Traceback' server.log; do sleep 1; done. Match the failure lines too: a check that waits only for success stays silent when the process crashes.",
].join("\n\n");
const MONITOR_DESCRIPTION = [
  "Watch a command's output as it happens: each line it prints to stdout reaches you as a notice (lines within 200 ms join one notice); stderr goes only to the output file. You also get one notice when the command exits or when timeout_ms passes (default 5 minutes, at most 30); start it again to keep watching. A notice that arrives while you are idle starts a model turn, so make the command print only lines you would act on; one that prints too much is stopped.",
  "For a single notification (a server is ready, a build finished), use bash_background with a command that exits when the condition holds.",
  "Every stage of a pipe must flush each line (grep --line-buffered, awk with fflush()), or lines wait in a buffer; head cannot.",
  "Silence is not success: match every outcome you would act on, failures as well as success, for example tail -f app.log | grep -E --line-buffered 'ready|ERROR|Traceback|FAILED'. Stop it with stop_background.",
].join("\n\n");
const STOP_DESCRIPTION =
  "Stop a background command or monitor started with bash_background or monitor. Returns after the command has exited.";

/** Registered once, inactive until Tool Execution is effective (see tool-execution/tools.ts). */
export function registerBackgroundTools(pi: any, jobs: BackgroundJobs, host: BackgroundHost): void {
  const guard = () => {
    if (!host.effective())
      throw new Error("Background commands are available only while Freeflow Tool Execution is on.");
  };
  pi.registerTool({
    name: BASH_BACKGROUND,
    label: BASH_BACKGROUND,
    description: START_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        command: { type: "string", description: "Shell command to run" },
        description: { type: "string", description: "A few words saying what the command does" },
      },
      required: ["command"],
    },
    outputSchema: {
      type: "object",
      properties: { id: { type: "string" }, outputPath: { type: "string" } },
      required: ["id", "outputPath"],
    },
    exposure: "direct",
    defaultActive: false,
    async execute(
      _id: string,
      params: { command: string; description?: string },
      _signal: unknown,
      _u: unknown,
      ctx: any,
    ) {
      guard();
      const { id, outputPath } = await jobs.start(
        String(params?.command ?? ""),
        params?.description,
        ctx.cwd,
        ctx.sessionManager?.getSessionId?.() ?? "session",
      );
      return {
        content: [
          {
            type: "text",
            text: `Command running in background with ID ${id}. Output: ${outputPath}. You will be notified when it exits. Read that file for output so far.`,
          },
        ],
        details: { id, outputPath },
        structuredContent: { id, outputPath },
      };
    },
  });
  pi.registerTool({
    name: MONITOR,
    label: MONITOR,
    description: MONITOR_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        command: { type: "string", description: "Shell command whose stdout lines are the events" },
        description: { type: "string", description: "A few words saying what is watched; shown with every event" },
        timeout_ms: {
          type: "number",
          minimum: 1_000,
          maximum: MONITOR_MAX_MS,
          description: `Stop watching after this long (default ${MONITOR_DEFAULT_MS}, at most ${MONITOR_MAX_MS})`,
        },
      },
      required: ["command", "description"],
    },
    outputSchema: {
      type: "object",
      properties: { id: { type: "string" }, outputPath: { type: "string" }, timeoutMs: { type: "number" } },
      required: ["id", "outputPath", "timeoutMs"],
    },
    exposure: "direct",
    defaultActive: false,
    async execute(
      _id: string,
      params: { command: string; description: string; timeout_ms?: number },
      _signal: unknown,
      _u: unknown,
      ctx: any,
    ) {
      guard();
      const started = await jobs.monitor(
        String(params?.command ?? ""),
        String(params?.description ?? ""),
        Number(params?.timeout_ms ?? MONITOR_DEFAULT_MS),
        ctx.cwd,
        ctx.sessionManager?.getSessionId?.() ?? "session",
      );
      const minutes = Math.round(((started.timeoutMs ?? MONITOR_DEFAULT_MS) / 60_000) * 10) / 10;
      return {
        content: [
          {
            type: "text",
            text: `Monitor ${started.id} started. Each line it prints reaches you as a notice; it stops when the command exits, after ${minutes} min, or with stop_background. When you tell the user you are watching, say it stops after ${minutes} min unless restarted. Output: ${started.outputPath}.`,
          },
        ],
        details: started,
        structuredContent: started,
      };
    },
  });
  pi.registerTool({
    name: STOP_BACKGROUND,
    label: STOP_BACKGROUND,
    description: STOP_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { id: { type: "string", description: "The ID bash_background or monitor returned" } },
      required: ["id"],
    },
    outputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["stopped", "completed", "failed"] },
        exitCode: { type: "number" },
      },
      required: ["id", "status"],
    },
    exposure: "direct",
    defaultActive: false,
    async execute(_id: string, params: { id: string }) {
      guard();
      const { text, structured } = await jobs.stop(String(params?.id ?? ""));
      return { content: [{ type: "text", text }], details: structured, structuredContent: structured };
    },
  });
}
