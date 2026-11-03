import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { freeflowHome } from "../messaging/registry.js";
/** Pi's file tools that write, and the paths each names. */
function writtenPaths(toolName, input, cwd) {
  const named =
    toolName === "edit" || toolName === "write"
      ? [input?.path, input?.file_path]
      : toolName === "apply_patch" && typeof input?.input === "string"
        ? [...input.input.matchAll(/^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/gm)].map(
            (match) => match[1],
          )
        : [];
  return named
    .filter((path) => typeof path === "string" && path !== "")
    .map((path) => (isAbsolute(path) ? resolve(path) : resolve(cwd, path)));
}
export class GateRuntime {
  packageRoot;
  module;
  loading;
  state = null;
  stateRead = false;
  session;
  warned = new Set();
  rows = new Map();
  missingNoted = false;
  settled = false;
  constructor(packageRoot) {
    this.packageRoot = packageRoot;
  }
  /** Loads gates5.mjs from Freeflow's package once; until it has loaded, every call is allowed. */
  load() {
    this.loading ??= import(
      pathToFileURL(join(this.packageRoot, "skills", "track-work", "scripts", "lib", "gates5.mjs")).href
    )
      .then((loaded) => {
        this.module = loaded;
      })
      .catch(() => {
        this.module = undefined;
      });
    return this.loading;
  }
  /** A session starts or reloads: the state is read again for it, and no gate has warned this turn. */
  begin(session) {
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
  async refresh(options = {}) {
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
  turnStart() {
    this.warned.clear();
  }
  /** Whether the state is missing once session start has settled, said once a session (section 5); the caller logs it. */
  missingOnce() {
    if (!this.settled || this.state !== null || this.missingNoted) return false;
    this.missingNoted = true;
    return true;
  }
  /**
   * Decides one tool call. Pure apart from this turn's warned gates; no file is read. Pi has no workers, so the
   * delegation gate never fires here.
   */
  check(event, cwd, settings, canAsk) {
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
  takeRows(toolCallId) {
    if (typeof toolCallId !== "string") return [];
    const rows = this.rows.get(toolCallId) ?? [];
    this.rows.delete(toolCallId);
    return rows;
  }
  /** The text of one gate that fired, for a question to the person. */
  text(fired) {
    return this.module?.gateText(fired) ?? fired.reason;
  }
  /** A gate's event line fields. */
  eventFields(fired, tool) {
    return this.module?.gateEvent(fired, tool) ?? { gate: fired.gate, decision: fired.decision, tool };
  }
}
