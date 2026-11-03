import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { freeflowHome } from "../messaging/registry.js";
import type { GateSettings } from "../host/config-validation.js";

/**
 * Freeflow's gates on Pi (SPEC-008 4.3), as Claude Code's mod runs them: before a tool call, Track Work's
 * `lib/gates5.mjs` decides it against the agreement, Slice, delivery and delegation gates, from the session's gate
 * state (`<FREEFLOW_HOME>/sessions/<session>/gates.json`), which this keeps in memory: read at session start and after
 * the agent runs Track Work's script, never per call (performance rule R-1). Under warn the call runs and its result
 * gains one row per gate per turn, as Tool Execution's notices do; under block it is refused with the same text, and a
 * delivery step asks the person where Pi has a screen.
 */

export interface Fired {
  gate: string;
  decision: "warn" | "ask" | "block";
  reason: string;
  way: string;
  rule: string;
}

interface Decision {
  gate: string | null;
  decision: "allow" | "warn" | "ask" | "block";
  fired: Fired[];
}

/** What Pi's extension uses of gates5.mjs. */
interface GatesModule {
  decide(state: unknown, call: Record<string, unknown>, settings: GateSettings): Decision;
  gateText(fired: Fired): string;
  gateEvent(fired: Fired, tool: string): Record<string, unknown>;
  validGateState(state: unknown): boolean;
}

/** Pi's file tools that write, and the paths each names. */
function writtenPaths(toolName: string, input: any, cwd: string): string[] {
  const named =
    toolName === "edit" || toolName === "write"
      ? [input?.path, input?.file_path]
      : toolName === "apply_patch" && typeof input?.input === "string"
        ? [...input.input.matchAll(/^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/gm)].map(
            (match: RegExpMatchArray) => match[1],
          )
        : [];
  return named
    .filter((path): path is string => typeof path === "string" && path !== "")
    .map((path) => (isAbsolute(path) ? resolve(path) : resolve(cwd, path)));
}

export type GateOutcome =
  | { kind: "allow"; fired: Fired[] }
  | { kind: "warn"; fired: Fired[]; rows: string[] }
  | { kind: "ask" | "block"; fired: Fired[]; reason: string };

export class GateRuntime {
  private module: GatesModule | undefined;
  private loading: Promise<void> | undefined;
  private state: unknown = null;
  private stateRead = false;
  private session: string | undefined;
  private warned = new Set<string>();
  private rows = new Map<string, string[]>();
  private missingNoted = false;
  private settled = false;

  constructor(private readonly packageRoot: string) {}

  /** Loads gates5.mjs from Freeflow's package once; until it has loaded, every call is allowed. */
  load(): Promise<void> {
    this.loading ??= import(
      pathToFileURL(join(this.packageRoot, "skills", "track-work", "scripts", "lib", "gates5.mjs")).href
    )
      .then((loaded) => {
        this.module = loaded as GatesModule;
      })
      .catch(() => {
        this.module = undefined;
      });
    return this.loading;
  }

  /** A session starts or reloads: the state is read again for it, and no gate has warned this turn. */
  begin(session: string | undefined): void {
    this.session = session;
    this.state = null;
    this.stateRead = false;
    this.warned.clear();
    this.rows.clear();
    this.missingNoted = false;
    this.settled = false;
  }

  /**
   * Reads the session's gate state into memory: at session start, again once session status has run (`settled`: a
   * state still missing then is missing), and after a Track Work command.
   */
  async refresh(options: { settled?: boolean } = {}): Promise<void> {
    await this.load();
    if (!this.session) return;
    try {
      const parsed = JSON.parse(
        await readFile(join(resolve(freeflowHome()), "sessions", this.session, "gates.json"), "utf8"),
      );
      this.state = this.module?.validGateState(parsed) ? parsed : null;
    } catch {
      this.state = null;
    }
    this.stateRead = true;
    if (options.settled) this.settled = true;
  }

  /** A new turn: each gate may warn once more. */
  turnStart(): void {
    this.warned.clear();
  }

  /** Whether the state is missing once session start has settled, said once a session (section 5); the caller logs it. */
  missingOnce(): boolean {
    if (!this.settled || this.state !== null || this.missingNoted) return false;
    this.missingNoted = true;
    return true;
  }

  /**
   * Decides one tool call. Pure apart from this turn's warned gates; no file is read. Pi has no workers, so the
   * delegation gate never fires here.
   */
  check(
    event: { toolName: string; input: any; toolCallId?: string },
    cwd: string,
    settings: GateSettings,
    canAsk: boolean,
  ): GateOutcome {
    const module = this.module;
    // Until the module has loaded and the state has been read once at session start, every call is allowed.
    if (!module || !this.stateRead) return { kind: "allow", fired: [] };
    const command = event.toolName === "bash" ? String(event.input?.command ?? "") : undefined;
    const result = module.decide(
      this.state,
      { tool: event.toolName, paths: writtenPaths(event.toolName, event.input, cwd), command, cwd, canAsk },
      settings,
    );
    if (result.decision === "allow") return { kind: "allow", fired: [] };
    if (result.decision === "block" || result.decision === "ask") {
      const refused = result.fired.filter((each) => each.decision !== "warn");
      const reason = refused.map((each) => module.gateText(each)).join("\n\n");
      return { kind: result.decision, fired: result.fired, reason };
    }
    const rows = result.fired
      .filter((each) => !this.warned.has(each.gate))
      .map((each) => {
        this.warned.add(each.gate);
        return module.gateText(each);
      });
    if (rows.length && typeof event.toolCallId === "string") this.rows.set(event.toolCallId, rows);
    return { kind: "warn", fired: result.fired, rows };
  }

  /** The warning rows a call's result gains, taken once. */
  takeRows(toolCallId: unknown): string[] {
    if (typeof toolCallId !== "string") return [];
    const rows = this.rows.get(toolCallId) ?? [];
    this.rows.delete(toolCallId);
    return rows;
  }

  /** The text of one gate that fired, for a question to the person. */
  text(fired: Fired): string {
    return this.module?.gateText(fired) ?? fired.reason;
  }

  /** A gate's event line fields. */
  eventFields(fired: Fired, tool: string): Record<string, unknown> {
    return this.module?.gateEvent(fired, tool) ?? { gate: fired.gate, decision: fired.decision, tool };
  }
}
