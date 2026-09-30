import { randomBytes } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";

export const BASH_BACKGROUND = "bash_background";
export const STOP_BACKGROUND = "stop_background";
export const NOTICE_TYPE = "freeflow-background";
export const MAX_RUNNING = 16;

type Status = "running" | "completed" | "failed" | "stopped";

interface Job {
  id: string;
  label: string;
  outputPath: string;
  controller: AbortController;
  status: Status;
  exitCode?: number;
  /** Set before the job's signal is aborted: the stop's own result reports it, so no notice is sent. */
  stopping?: "tool" | "shutdown";
  /** Settles after the process exited and the output file is closed. */
  done: Promise<void>;
}

export interface BackgroundHost {
  /** Whether Tool Execution is effective now. */
  effective(): boolean;
  /** Pi's `shellPath` setting, so background commands run in the same shell as `bash`. */
  shellPath(): string | undefined;
  /** Deliver an exit notice or restatement as a message after what the model already received. */
  send(content: string, details: Record<string, unknown>, triggerTurn: boolean): void;
}

const newId = () => `bg${randomBytes(6).readUIntBE(0, 6).toString(36).slice(-6).padStart(6, "0")}`;

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

  constructor(private readonly host: BackgroundHost) {}

  running(): Job[] {
    return [...this.jobs.values()].filter((job) => job.status === "running");
  }

  async start(command: string, description: string | undefined, cwd: string, sessionId: string) {
    const running = this.running();
    if (running.length >= MAX_RUNNING)
      throw new Error(`${MAX_RUNNING} background commands are running. Stop one with stop_background, then retry.`);
    let id = newId();
    while (this.jobs.has(id)) id = newId();
    const folder = join(tmpdir(), "freeflow", sessionId.replace(/[^A-Za-z0-9._-]/g, "_"), "background");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const outputPath = join(folder, `${id}.output`);
    const stream = createWriteStream(outputPath, { flags: "w", mode: 0o600 });
    await new Promise<void>((resolve, reject) => {
      stream.once("open", () => resolve());
      stream.once("error", reject);
    });
    const controller = new AbortController();
    let endsWithNewline = true;
    const job: Job = {
      id,
      label: labelFor(command, description),
      outputPath,
      controller,
      status: "running",
      done: Promise.resolve(),
    };
    const run = createLocalBashOperations({ shellPath: this.host.shellPath() }).exec(command, cwd, {
      onData: (data) => {
        if (data.length === 0) return;
        endsWithNewline = data[data.length - 1] === 10;
        stream.write(data);
      },
      signal: controller.signal,
    });
    job.done = run.then(
      async ({ exitCode }) => {
        const code = exitCode ?? 1;
        job.exitCode = code;
        job.status = code === 0 ? "completed" : "failed";
        await close(stream, `${endsWithNewline ? "" : "\n"}[exited with code ${code}]\n`);
        this.notify(job);
      },
      async (error) => {
        const lead = endsWithNewline ? "" : "\n";
        if (job.stopping) {
          job.status = "stopped";
          await close(stream, `${lead}${job.stopping === "tool" ? "[stopped]" : "[stopped at session end]"}\n`);
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
    return { id, outputPath };
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
    const list = running.map((job) => `${job.id} (${job.label}), output ${job.outputPath}`).join("; ");
    this.host.send(
      `Still running: ${list}. Do not start them again; stop one with stop_background before restarting it.`,
      { running: running.map((job) => ({ id: job.id, outputPath: job.outputPath })) },
      false,
    );
  }

  private notify(job: Job, runError?: string): void {
    if (job.stopping) return;
    const outcome =
      runError !== undefined
        ? `failed to run: ${runError}`
        : job.status === "completed"
          ? "completed"
          : `failed with exit code ${job.exitCode}`;
    this.host.send(
      `Background command ${job.id} (${job.label}) ${outcome}. Output: ${job.outputPath}.`,
      {
        id: job.id,
        status: job.status,
        ...(job.exitCode === undefined ? {} : { exitCode: job.exitCode }),
        outputPath: job.outputPath,
      },
      true,
    );
  }
}

const START_DESCRIPTION =
  "Run a shell command in the background. Use it for servers, watchers and commands expected to run longer than two minutes. Returns an ID and an output file at once; you are notified when the command exits. Read the output file for output so far.";
const STOP_DESCRIPTION =
  "Stop a background command started with bash_background. Returns after the command has exited.";

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
    name: STOP_BACKGROUND,
    label: STOP_BACKGROUND,
    description: STOP_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { id: { type: "string", description: "The ID bash_background returned" } },
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
