import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";

/**
 * Freeflow's Pi layer for the Freeflow store, as the Claude Code mod is Claude Code's (the task-004 Spec's section 11):
 * it decides when Track Work's script runs and delivers what it prints; what happens to a task's memory is the
 * script's. It keeps the session's state in the store in memory (performance rule R-1), read at session start, when a
 * run ends after it touched the store, and at a compaction, never on the way to a request.
 */

const SCRIPT = join("skills", "track-work", "scripts", "working-record.mjs");
/** Pi's file tools, whose `path` may land in the store. */
const FILE_TOOLS = new Set(["read", "edit", "write", "apply_patch"]);

export interface StoreState {
  home: string;
  store: boolean;
  session: string | null;
  task?: { id: string; record: string; stateAsOf: string | null } | null;
  summary?: { path: string; asOf: string | null } | null;
  compact?: { path: string; requestedAt: string; done: boolean } | null;
  changed?: boolean;
  missing?: { what: string; fix: string; by: string }[];
}

export interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

export type Run = (args: string[], options?: { timeoutMs?: number }) => Promise<Ran>;

/** Runs Track Work's script from Freeflow's package, as the agent's commands run it, with the session's environment. */
export function scriptRunner(packageRoot: string): Run {
  return (args, { timeoutMs = 60_000 } = {}) =>
    new Promise((done) =>
      execFile(
        process.execPath,
        [join(packageRoot, SCRIPT), ...args],
        { env: process.env, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
        (error: any, stdout, stderr) =>
          done({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr }),
      ),
    );
}

/**
 * What the scripts read about this session (T6): who it is, the harness, its transcript, the window and the way back.
 * Set in Pi's process, so the agent's own commands, which run with Pi's environment, see the same.
 */
export function sessionEnvironment(session: { id?: string; file?: string; window?: number }): void {
  const set = (name: string, value: string | undefined) => {
    if (value) process.env[name] = value;
    else delete process.env[name];
  };
  set("FREEFLOW_SESSION", session.id);
  set("FREEFLOW_HARNESS", session.id ? "Pi" : undefined);
  set("FREEFLOW_TRANSCRIPT", session.file);
  set("FREEFLOW_RESUME", session.file ? `pi --session ${session.file}` : undefined);
  set("FREEFLOW_CONTEXT_WINDOW", session.window ? String(session.window) : undefined);
}

/** Whether a tool call may change the store: Track Work's script in a command, or a file tool on a path inside it. */
export function touchesStore(toolName: string, input: any, cwd: string, home: string | undefined): boolean {
  if (toolName === "bash") return typeof input?.command === "string" && input.command.includes("working-record.mjs");
  if (!home || !FILE_TOOLS.has(toolName)) return false;
  const paths = [input?.path, input?.file_path].filter((value): value is string => typeof value === "string");
  const root = resolve(home);
  return paths.some((path) => {
    const full = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
    return full === root || full.startsWith(root + sep);
  });
}

export class StoreLayer {
  private state?: StoreState;
  private touched = false;

  constructor(private readonly run: Run) {}

  /** The session's state as last read; undefined before the first read. */
  current(): StoreState | undefined {
    return this.state;
  }

  /** The task this session holds, as last read. */
  heldTask(): string | undefined {
    return this.state?.store ? (this.state.task?.id ?? undefined) : undefined;
  }

  /** Forget everything: a new session, or one shut down. */
  reset(): void {
    this.state = undefined;
    this.touched = false;
  }

  /** A tool call this run may have changed the store with; the run's end reads the store again. */
  note(toolName: string, input: any, cwd: string): void {
    if (touchesStore(toolName, input, cwd, this.state?.home)) this.touched = true;
  }

  /** Whether this run touched the store. */
  touchedThisRun(): boolean {
    return this.touched;
  }

  /** Session status, read now and kept; undefined where it cannot be read. */
  async refresh(): Promise<StoreState | undefined> {
    const ran = await this.run(["session", "status"]);
    if (ran.code !== 0) return this.state;
    try {
      this.state = JSON.parse(ran.stdout);
    } catch {
      // An unreadable answer keeps what was known.
    }
    return this.state;
  }

  /**
   * Session start: where a store exists, take the remote's changes and return the menu with the rules every task
   * follows (Spec section 4); where none exists, what is missing, if anything; undefined when there is nothing to say.
   */
  async start(cwd: string, scan: string[]): Promise<string | undefined> {
    const state = await this.refresh();
    if (!state) return undefined;
    const missing = (state.missing ?? []).map(
      (part) => `- Missing: ${part.what}. Fix (${part.by === "user" ? "the user" : "the agent"}): ${part.fix}.`,
    );
    if (!state.store) return missing.length ? `The store is not ready.\n${missing.join("\n")}` : undefined;
    await this.run(["store", "sync", "--pull"]);
    const menu = await this.run([
      "task",
      "here",
      "--cwd",
      cwd,
      "--scan",
      scan.join(process.platform === "win32" ? ";" : ":"),
      "--rules",
    ]);
    await this.refresh();
    if (menu.code !== 0) return missing.length ? missing.join("\n") : undefined;
    return [menu.stdout.trimEnd(), ...missing].join("\n");
  }

  /**
   * A run is ending: after a run that touched the store, read it again and sync what changed. Returns the state, or
   * undefined when this run did not touch the store.
   */
  async runEnded(): Promise<StoreState | undefined> {
    if (!this.touched) return undefined;
    this.touched = false;
    const state = await this.refresh();
    if (state?.store && state.changed) await this.run(["store", "sync"]);
    return state;
  }

  /** The text Freeflow's compaction installs: the held task's bundle, or the session summary's. */
  async bundle(options: { fallback?: boolean; recent: boolean }): Promise<Ran> {
    const state = this.state;
    const args =
      state?.store && state.task
        ? ["view", "bundle", "--record", state.task.record, ...(options.fallback ? ["--fallback"] : [])]
        : ["view", "bundle", "--session"];
    return this.run([...args, ...(options.recent ? [] : ["--no-recent"])]);
  }

  /** Marks a checkpoint --compact request answered, once the bundle has replaced the conversation. */
  async answered(): Promise<void> {
    const request = this.state?.compact;
    if (!request || request.done) return;
    const { path, ...rest } = request;
    await writeFile(path, `${JSON.stringify({ ...rest, done: true }, null, 2)}\n`);
    this.state = { ...this.state!, compact: { ...request, done: true } };
  }

  /** The session ends: release the hold, or sync what is left, within the time Pi gives a shutdown. */
  async shutdown(): Promise<void> {
    const state = this.state;
    if (!state?.store) return;
    if (state.task) await this.run(["task", "release"], { timeoutMs: 10_000 });
    else if (state.changed || this.touched) await this.run(["store", "sync"], { timeoutMs: 10_000 });
  }
}
