import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { freeflowNotice } from "./inbound.js";
/** The pointers Pi sends: Pi has no workers, and its guidance notices send the diagnose line. */
const ON_PI = new Set(["pull-request", "test-edit"]);
/** The paths a Pi file tool writes, as named: `edit` and `write` name one; `apply_patch` names each file it touches. */
function writtenPaths(toolName, input) {
  const named =
    toolName === "edit" || toolName === "write"
      ? [input?.path, input?.file_path]
      : toolName === "apply_patch" && typeof input?.input === "string"
        ? [...input.input.matchAll(/^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/gm)].map(
            (match) => match[1],
          )
        : [];
  return named.filter((path) => typeof path === "string" && path !== "");
}
export class ReferencePointers {
  packageRoot;
  cycleNow;
  module;
  loading;
  /** The cycle the sent set belongs to, and the pointers sent in it. */
  sent = { cycle: Number.NaN, ids: new Set() };
  unused = new Map();
  constructor(
    packageRoot,
    /** The context cycle the session is in now (the compaction controller's count). */
    cycleNow,
  ) {
    this.packageRoot = packageRoot;
    this.cycleNow = cycleNow;
  }
  /** Loads pointers.mjs from Freeflow's package once; until it has loaded, no pointer comes. */
  load() {
    this.loading ??= import(pathToFileURL(join(this.packageRoot, "hooks", "shared", "pointers.mjs")).href)
      .then((loaded) => {
        this.module = loaded;
      })
      .catch(() => {
        this.module = undefined;
      });
    return this.loading;
  }
  /** A session starts or reloads: no pointer has been sent in it. */
  begin() {
    this.sent = { cycle: Number.NaN, ids: new Set() };
  }
  /**
   * The notices to join to a tool result: each pointer the call raises that this cycle has not had, wrapped as a
   * guidance notice. A nested call (a codemode script's) raises none.
   */
  toolResult(event, ctx) {
    const module = this.module;
    if (!module || event?.parentToolCallId) return [];
    const tool = String(event?.toolName ?? "");
    const command = tool === "bash" ? String(event?.input?.command ?? "") : undefined;
    const raised = [
      ...module.beforeCall({ tool, command }),
      // No command: the diagnose line's count is the guidance notices', not this.
      ...module.afterCall(
        { tool, paths: writtenPaths(tool, event?.input), failed: event?.isError === true },
        this.unused,
      ),
    ].filter((id) => ON_PI.has(id));
    if (!raised.length) return [];
    const cycle = this.cycleNow(ctx);
    if (cycle !== this.sent.cycle) this.sent = { cycle, ids: new Set() };
    const lines = [];
    for (const id of raised) {
      if (this.sent.ids.has(id)) continue;
      this.sent.ids.add(id);
      lines.push(freeflowNotice("guidance", module.POINTERS[id]));
    }
    return lines;
  }
}
