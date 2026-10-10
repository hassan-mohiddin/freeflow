import type { TaskMemory, TaskResult } from "./runtime.js";

export const FREEFLOW_TASK = "freeflow_task";

const DESCRIPTION =
  "Work with the Working Records (Track Work task memory) attached to this session. list: records in this repository and which are attached. attach: propose attaching a record; the user confirms, and its resume view is returned. focus: switch attention to an attached record and get its resume view. detach: stop working on an attached record. Propose attaching only when Track Work calls for a record; a session needs none.";

export interface TaskToolHost {
  memory: TaskMemory;
  /** After a change, so the Runtime State shows it. */
  changed(ctx: any): void;
}

/** Registered once, declared only while task memory is effective (see applyTaskMemoryTools). */
export function registerTaskMemoryTool(pi: any, host: TaskToolHost): void {
  pi.registerTool({
    name: FREEFLOW_TASK,
    label: "Task",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ["list", "attach", "focus", "detach"] },
        record: { type: "string", description: "Path to the task's record.md (or its task directory)" },
      },
      required: ["action"],
    },
    exposure: "direct",
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id: string, params: any, _signal: AbortSignal, _update: unknown, ctx: any) {
      const result = await run(host, params, ctx);
      if (result.ok && params?.action !== "list") host.changed(ctx);
      return {
        content: [{ type: "text", text: result.text }],
        details: result.snapshot ? { snapshot: result.snapshot } : {},
        ...(result.ok ? {} : { isError: true }),
      };
    },
  });
}

async function run(host: TaskToolHost, params: any, ctx: any): Promise<TaskResult> {
  const { memory } = host;
  const cwd = ctx.cwd;
  switch (params?.action) {
    case "list":
      return { ok: true, text: await memory.list(cwd) };
    case "attach": {
      if (!ctx.hasUI) return { ok: false, text: "Attaching needs the user's confirmation, and no UI is available." };
      const label = typeof params.record === "string" ? params.record : "";
      const yes = await ctx.ui.confirm(
        "Attach task record?",
        `The agent proposes working on ${label} in this session.`,
      );
      if (!yes) return { ok: false, text: "The user declined attaching this record." };
      return memory.attach(params.record, cwd);
    }
    case "focus":
      return memory.focus(params.record, cwd);
    case "detach":
      return memory.detach(params.record, cwd);
    default:
      return { ok: false, text: "action must be list, attach, focus or detach." };
  }
}

/** Declare or withdraw freeflow_task when task memory's effective state changes, keeping other tools in place. */
export function applyTaskMemoryTools(pi: any, effective: boolean): void {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
  const current: string[] = pi.getActiveTools();
  const present = current.includes(FREEFLOW_TASK);
  if (effective && !present) pi.setActiveTools([...current, FREEFLOW_TASK]);
  if (!effective && present) pi.setActiveTools(current.filter((name) => name !== FREEFLOW_TASK));
}
