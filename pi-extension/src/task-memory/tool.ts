import type { TaskMemory, TaskResult } from "./runtime.js";

export const FREEFLOW_TASK = "freeflow_task";

const DESCRIPTION =
  "Work with the Working Records (Track Work task memory) attached to this session. list: records for this repository and which are attached. attach: propose attaching a record by task ID or path; the user confirms, and its resume view is returned. focus: switch attention to an attached record and get its resume view. detach: stop working on an attached record. create: create a task in this repository's project. child: create a child record of the focused task for a parallel session. fanout: create a child with its own Git worktree and branch, for a parallel session the user starts there. view: read a record's resume view, or one entry, by task ID. search: find lines across the focused record (task), its parent and children (tree), or its project. Propose attaching only when Track Work calls for a record; a session needs none.";

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
        action: {
          type: "string",
          enum: ["list", "attach", "focus", "detach", "create", "child", "fanout", "view", "search"],
        },
        record: { type: "string", description: "A task ID such as my-project/task-003, or a record.md path" },
        title: { type: "string", description: "create, child, fanout: the new record's title" },
        goal: { type: "string", description: "create, child, fanout: its goal, one line" },
        entry: { type: "string", description: "view: one entry ID such as S-004" },
        query: { type: "string", description: "search: text to find" },
        scope: { type: "string", enum: ["task", "tree", "project"], description: "search: where to look" },
      },
      required: ["action"],
    },
    exposure: "direct",
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id: string, params: any, _signal: AbortSignal, _update: unknown, ctx: any) {
      const result = await run(host, params, ctx);
      if (result.ok && ["attach", "focus", "detach"].includes(params?.action)) host.changed(ctx);
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
    case "create":
      return memory.create(params.title, params.goal, cwd);
    case "child":
      return memory.child(params.title, params.goal);
    case "fanout":
      return memory.fanout(params.title, params.goal);
    case "view":
      return memory.view(params.record, params.entry, cwd);
    case "search":
      return memory.search(params.query, params.scope, cwd);
    default:
      return { ok: false, text: "action must be list, attach, focus, detach, create, child, fanout, view or search." };
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
