import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { freeflowNotice } from "./inbound.js";

/**
 * The reference pointers on Pi (hooks/shared/pointers.mjs decides which call raises which): a pull request about to
 * open (`gh pr create`, or a tool that creates one) and a test file edited each add their one line to that call's
 * result, at most once a context cycle, while `pointers.enabled` is on. Pi has no workers, so the delegation pointer
 * never comes, and the diagnose pointer is Tool Execution's guidance notice already (guidance-notices.ts), which
 * `pointers.enabled` off also holds back.
 *
 * Cache: a pointer is part of a tool result not yet delivered, as Tool Execution's notices are; nothing already sent
 * changes. Request path: none of this runs per request. A tool result costs a few regular expressions; only a result
 * that raises a pointer asks for the cycle (a count over the cached branch).
 */

/** What Pi's extension uses of pointers.mjs. */
interface PointersModule {
  POINTERS: Readonly<Record<string, string>>;
  beforeCall(call: { tool: string; command?: string }): string[];
  afterCall(
    call: { tool: string; command?: string; paths?: string[]; failed: boolean },
    failures: Map<string, number>,
  ): string[];
}

/** The pointers Pi sends: Pi has no workers, and its guidance notices send the diagnose line. */
const ON_PI = new Set(["pull-request", "test-edit"]);

/** The paths a Pi file tool writes, as named: `edit` and `write` name one; `apply_patch` names each file it touches. */
function writtenPaths(toolName: string, input: any): string[] {
  const named =
    toolName === "edit" || toolName === "write"
      ? [input?.path, input?.file_path]
      : toolName === "apply_patch" && typeof input?.input === "string"
        ? [...input.input.matchAll(/^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/gm)].map(
            (match: RegExpMatchArray) => match[1],
          )
        : [];
  return named.filter((path): path is string => typeof path === "string" && path !== "");
}

export class ReferencePointers {
  private module: PointersModule | undefined;
  private loading: Promise<void> | undefined;
  /** The cycle the sent set belongs to, and the pointers sent in it. */
  private sent = { cycle: Number.NaN, ids: new Set<string>() };
  private readonly unused = new Map<string, number>();

  constructor(
    private readonly packageRoot: string,
    /** The context cycle the session is in now (the compaction controller's count). */
    private readonly cycleNow: (ctx: any) => number,
  ) {}

  /** Loads pointers.mjs from Freeflow's package once; until it has loaded, no pointer comes. */
  load(): Promise<void> {
    this.loading ??= import(pathToFileURL(join(this.packageRoot, "hooks", "shared", "pointers.mjs")).href)
      .then((loaded) => {
        this.module = loaded as PointersModule;
      })
      .catch(() => {
        this.module = undefined;
      });
    return this.loading;
  }

  /** A session starts or reloads: no pointer has been sent in it. */
  begin(): void {
    this.sent = { cycle: Number.NaN, ids: new Set() };
  }

  /**
   * The notices to join to a tool result: each pointer the call raises that this cycle has not had, wrapped as a
   * guidance notice. A nested call (a codemode script's) raises none.
   */
  toolResult(event: any, ctx: any): string[] {
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
    const lines: string[] = [];
    for (const id of raised) {
      if (this.sent.ids.has(id)) continue;
      this.sent.ids.add(id);
      lines.push(freeflowNotice("guidance", module.POINTERS[id]!));
    }
    return lines;
  }
}
