import type { TaskMemory, TaskResult } from "./runtime.js";
import { autoApproveGroup, type AutoApproveGroup } from "./config.js";
import { renderTaskCall, renderTaskResult } from "./render.js";
import { confirmWithUser } from "../ask-user/ask.js";

export const TASK_MEMORY_TOOL = "task_memory";

const DESCRIPTION =
  "Task memory: the Working Records (Track Work) this session works on, and their projects. Read the task-memory skill before your first proposal; Track Work decides what records say. Reading needs no permission: projects lists every project; list lists this repository's records, or a project's tasks; view reads a record's resume view or one entry by task ID; search finds lines in the focused task, its tree, or its project. Attention: focus switches to an attached record; detach stops working on one. Proposals, each confirmed by the user in a dialog before anything happens: attach a record; create a task in this repository's project and attach it; child or fanout (a child with its own Git worktree) of the focused task for a parallel session; project_new or project_link for this repository; import a repository record into a project; confirm a held record; env to change a task's directories; remove a task with its children, or project_remove a whole project, which moves their records to the trash. Only the user empties the trash, with /freeflow trash empty: when asked to, tell the user to run it. A decline is the user's answer: do not retry it or work around it.";

export interface TaskToolHost {
  memory: TaskMemory;
  /** After a change, so the Runtime State shows it. */
  changed(ctx: any): void;
  /**
   * Why this profile may not take an action that opens a dialog or changes what the session holds, or undefined when
   * it may: under automatic Cognitive Routing only the Coordinator does (Task 004 D-001).
   */
  refusal?(): string | undefined;
  /** Whether the user's taskMemory.autoApprove setting lets proposals in this group run without the dialog. */
  autoApproved?(group: AutoApproveGroup): boolean;
}

const ACTIONS = [
  "projects",
  "list",
  "view",
  "search",
  "attach",
  "focus",
  "detach",
  "create",
  "child",
  "fanout",
  "project_new",
  "project_link",
  "import",
  "confirm",
  "env",
  "remove",
  "project_remove",
];
// Actions that change which records this session holds; the Runtime State follows them.
const CHANGES_STATE = new Set(["attach", "focus", "detach", "create", "import", "confirm", "remove", "project_remove"]);
/** Actions any profile may take: they only read. `env` reads too, unless it changes a directory. */
const READS = new Set(["projects", "list", "view", "search"]);
const reads = (params: any) =>
  READS.has(params?.action) ||
  (params?.action === "env" &&
    !params?.primary?.trim?.() &&
    !params?.add_dir?.trim?.() &&
    !params?.remove_dir?.trim?.());

/** Registered once, declared only while task memory is effective (see applyTaskMemoryTools). */
export function registerTaskMemoryTool(pi: any, host: TaskToolHost): void {
  pi.registerTool({
    name: TASK_MEMORY_TOOL,
    label: "Task memory",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: { type: "string", enum: ACTIONS },
        record: {
          type: "string",
          description: "A task ID such as my-project/task-003, or a record.md path; remove takes a task ID",
        },
        project: { type: "string", description: "list: a project's name; import: the project to move the record into" },
        name: { type: "string", description: "project_new, project_link, project_remove: the project's name" },
        worktrees: { type: "string", description: "project_new, project_link: where children's worktrees go" },
        title: { type: "string", description: "create, child, fanout: the new task's title" },
        goal: {
          type: "string",
          description:
            "create, child, fanout: its goal, one line; omitted, the title is the goal (the dialog shows it)",
        },
        entry: { type: "string", description: "view: one entry ID such as S-004" },
        query: { type: "string", description: "search: text to find" },
        scope: { type: "string", enum: ["task", "tree", "project"], description: "search: where to look" },
        primary: { type: "string", description: "env: the task's new primary directory" },
        add_dir: { type: "string", description: "env: a directory to add" },
        remove_dir: { type: "string", description: "env: a directory to remove" },
      },
      required: ["action"],
    },
    // It asks the user, so scripts must not call it (Pi's guidance for such tools); called directly, its own
    // transcript views apply, which a codemode script's nested call would bypass.
    exposure: "model-only",
    defaultActive: false,
    executionMode: "sequential",
    renderCall: (args: any, theme: any) => renderTaskCall(args, theme),
    renderResult: (result: any, options: any, theme: any, context: any) =>
      renderTaskResult(result, options, theme, context),
    async execute(_id: string, params: any, _signal: AbortSignal, _update: unknown, ctx: any) {
      const refused = reads(params) ? undefined : host.refusal?.();
      const group = reads(params) ? undefined : autoApproveGroup(params?.action);
      const approved = group !== undefined && host.autoApproved?.(group) === true;
      const result = refused ? { ok: false, text: refused } : await run(host, params, ctx, approved);
      if (approved && result.ok)
        result.text = `Auto-approved by the user's taskMemory.autoApprove setting (${group}); no dialog was shown.\n\n${result.text}`;
      if (result.ok && CHANGES_STATE.has(params?.action)) host.changed(ctx);
      let next: string | undefined;
      if (result.ok && result.snapshot) {
        const brief = await host.memory.brief(result.snapshot);
        result.headline ??= `${params.action === "focus" ? "Focus on" : "Attached"} ${brief.label} · ${brief.state}`;
        next = brief.next || undefined;
      }
      return {
        content: [{ type: "text", text: result.text }],
        details: {
          action: params?.action,
          ...(result.snapshot ? { snapshot: result.snapshot } : {}),
          ...(result.headline ? { headline: result.headline } : {}),
          ...(next ? { next } : {}),
          ...(result.command ? { command: result.command } : {}),
          ...(result.id ? { id: result.id } : {}),
        },
        ...(result.ok ? {} : { isError: true }),
      };
    },
  });
}

/** Ask the user before an action taken on their authority; without a UI the proposal cannot be confirmed. */
async function confirmProposal(ctx: any, title: string, message: string): Promise<TaskResult | undefined> {
  if (!ctx.hasUI) return { ok: false, text: `${title} needs the user's confirmation, and no UI is available.` };
  if (await confirmWithUser(ctx, title, message)) return undefined;
  return { ok: false, headline: "Declined by the user", text: "The user declined. Do not retry or work around it." };
}

const show = (value: unknown) => (typeof value === "string" ? value.trim() : "");

async function run(host: TaskToolHost, params: any, ctx: any, approved = false): Promise<TaskResult> {
  const { memory } = host;
  // An action the user's auto-approve setting covers runs without asking.
  const ask = (context: any, title: string, message: string) =>
    approved ? Promise.resolve(undefined) : confirmProposal(context, title, message);
  const cwd = ctx.cwd;
  switch (params?.action) {
    case "projects":
      return memory.projects(cwd);
    case "list":
      return { ok: true, text: await memory.list(cwd, params.project) };
    case "view":
      return memory.view(params.record, params.entry, cwd);
    case "search":
      return memory.search(params.query, params.scope, cwd);
    case "focus":
      return memory.focus(params.record, cwd);
    case "detach":
      return memory.detach(params.record, cwd);
    case "attach":
      return (
        (await ask(
          ctx,
          "Attach task record?",
          `The agent proposes working on ${show(params.record)} in this session.`,
        )) ?? memory.attach(params.record, cwd)
      );
    case "create": {
      const declined = await ask(
        ctx,
        "Create task?",
        `Create "${show(params.title)}" in this repository's project and attach it to this session? Goal: ${show(params.goal) || show(params.title)}`,
      );
      if (declined) return declined;
      const created = await memory.create(params.title, params.goal, cwd);
      if (!created.ok || !created.id) return created;
      const attached = await memory.attach(created.id, cwd);
      return attached.ok
        ? {
            ...attached,
            headline: `Created and attached ${created.id} — ${show(params.title)}`,
            text: `Created ${created.id} and attached it to this session.\n\n${attached.text}`,
          }
        : { ...attached, text: `Created ${created.id}, but it was not attached: ${attached.text}` };
    }
    case "child":
      return (
        (await ask(
          ctx,
          "Create child task?",
          `Create "${show(params.title)}" as a child of the focused task, for a parallel session you start?`,
        )) ?? memory.child(params.title, params.goal)
      );
    case "fanout":
      return (
        (await ask(
          ctx,
          "Fan out a child task?",
          `Create child "${show(params.title)}" of the focused task with its own Git worktree and branch? You start its session in a new terminal.`,
        )) ?? memory.fanout(params.title, params.goal)
      );
    case "project_new":
    case "project_link": {
      const operation = params.action === "project_new" ? "new" : "link";
      const declined = await ask(
        ctx,
        operation === "new" ? "Create project?" : "Link repository?",
        operation === "new"
          ? `Create project "${show(params.name)}" and link this repository (${cwd}) to it?${show(params.worktrees) ? ` Child worktrees go in ${show(params.worktrees)}.` : ""}`
          : `Link this repository (${cwd}) to project "${show(params.name)}"?`,
      );
      return declined ?? memory.project(operation, params.name, params.worktrees, cwd);
    }
    case "import":
      return (
        (await ask(
          ctx,
          "Import record?",
          `Move ${show(params.record)} into the ${show(params.project)} project's store, with a task ID?`,
        )) ?? memory.importRecord(params.record, params.project, cwd)
      );
    case "confirm":
      return (
        (await ask(
          ctx,
          "Make held record writable?",
          `Let this session write ${show(params.record) || "its held records"}, taking ownership where another session owns one?`,
        )) ?? memory.confirm(params.record, cwd)
      );
    case "env": {
      const change = { primary: show(params.primary), add: show(params.add_dir), remove: show(params.remove_dir) };
      if (change.primary || change.add || change.remove) {
        const declined = await ask(
          ctx,
          "Change task directories?",
          `For ${show(params.record)}: ${[change.primary && `primary ${change.primary}`, change.add && `add ${change.add}`, change.remove && `remove ${change.remove}`].filter(Boolean).join(", ")}?`,
        );
        if (declined) return declined;
      }
      return memory.environment(params.record, change, cwd);
    }
    case "remove":
    case "project_remove": {
      // Removal always asks: no auto-approve setting covers it (Task 006).
      const target = params.action === "remove" ? { task: params.record } : { project: params.name };
      const { question, error } = await memory.removalQuestion(target);
      if (!question) return { ok: false, text: error ?? "Nothing to remove." };
      const title = params.action === "remove" ? "Remove task?" : "Remove project?";
      return (await confirmProposal(ctx, title, question)) ?? memory.remove(target);
    }
    default:
      return { ok: false, text: `action must be one of ${ACTIONS.join(", ")}.` };
  }
}

/** Declare or withdraw task_memory when task memory's effective state changes, keeping other tools in place. */
export function applyTaskMemoryTools(pi: any, effective: boolean): void {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
  const current: string[] = pi.getActiveTools();
  const present = current.includes(TASK_MEMORY_TOOL);
  if (effective && !present) pi.setActiveTools([...current, TASK_MEMORY_TOOL]);
  if (!effective && present) pi.setActiveTools(current.filter((name) => name !== TASK_MEMORY_TOOL));
}
