import { existsSync, realpathSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { freeflowHome, Registry, type Owner, type RegisteredTask } from "./registry.js";

/**
 * Task memory: which Working Records a session works on. The user attaches records (the model may propose one); one
 * attached record is the focus. State is a fold over branch entries, so it follows /tree navigation and is copied on
 * fork; it is rebuilt at session start and navigation and otherwise kept in memory. A record is either registered
 * (a task or child in a project store, with an ID and one owner session; see registry.ts) or unregistered (a record
 * attached by path where Track Work keeps it). Records are read through Track Work's own library, so a record stays
 * valid for the script skill on other hosts.
 */
export const TASK_ENTRY = "freeflow-task-memory-v1";
export const SNAPSHOT_TYPE = "freeflow-task-memory-snapshot";

// "decline" records that the user declined attaching a directory's task; it does not change the attached set.
type Op = "attach" | "detach" | "focus" | "hold" | "confirm" | "decline";
export type TaskState = Readonly<{ attached: readonly string[]; held: readonly string[]; focus?: string }>;
/**
 * An operation's outcome. text is what the model reads; headline is the one line a collapsed transcript row shows;
 * command is a shell command for the user to paste (fan-out); id names a task the operation created.
 */
export type TaskResult = {
  ok: boolean;
  text: string;
  snapshot?: string;
  headline?: string;
  command?: string;
  id?: string;
};

/** How many of a project's other tasks a resume view indexes; the rest are counted and reached by search or list. */
export const PROJECT_INDEX_LIMIT = 15;

export interface TaskMemoryHost {
  effective(): boolean;
  append(data: Record<string, unknown>): void;
  send(content: string, record: string): void;
  /** This session, as a record's owner. */
  owner(): Owner;
  /** Ask the user; false without UI. */
  confirm(title: string, message: string): Promise<boolean>;
  /** The session's working directory. */
  cwd(): string;
  packageRoot: string;
  registry?: Registry;
}

const TASK_ID = /^[a-z0-9-]+\/task-\d+$/;

function section(text: string, heading: string): string | undefined {
  const match = new RegExp(`^### ${heading}\\n\\n([\\s\\S]*?)(?=\\n#{2,3} |$)`, "m").exec(text);
  return match?.[1].trim();
}

/** One line about a record: its task state, Current Slice and Next useful action. */
export function briefOf(text: string): { state: string; goal: string; slice: string; next: string } {
  const slice = section(text, "Current Slice") ?? "";
  return {
    state: /^State:\s*(\S+)/m.exec(text)?.[1] ?? "unknown",
    goal: (section(text, "Goal") ?? "").replace(/^- /, "").split("\n")[0],
    slice: /^#### (S-\d+ — .+)$/m.exec(slice)?.[1] ?? "None",
    next: (section(text, "Next useful action") ?? "").replace(/^- /, "").split("\n")[0],
  };
}

const RECORD_PATH = /(^|[\\/])\.freeflow[\\/]tasks[\\/][^\\/]+[\\/]record\.md$/;
// A project store's record: <store>/tasks/<task>/record.md, where <store>/store.json marks the store.
const STORE_RECORD = /[\\/]tasks[\\/]task-\d+-[^\\/]+[\\/]record\.md$/;
// A Track Work command that writes a record: lifecycle groups, task set-state, and task import.
const RECORD_WRITE =
  /working-record\.mjs["']?\s+(?:(?:slice|checkpoint|decision)\s+[a-z-]+|task\s+(?:set-state|import))(?![a-z-])/;
// A Track Work command that changes the registry: the task_memory tool asks the user for each of these on Pi.
const REGISTRY_CHANGE =
  /working-record\.mjs["']?\s+(?:task\s+(?:create|fanout|remove)|project\s+(?:new|link|remove))(?![a-z-])/;
const ENVIRONMENT_CHANGE = /working-record\.mjs["']?\s+task\s+env(?![a-z-])[^;&|\n]*--(?:primary|add-dir|remove-dir)/;
// Markers recordTargets returns for a write whose record is named by task ID, or cannot be read from the command.
export const ID_TARGET = "id:";
export const UNRESOLVED_TARGET = "unresolved:";

export function isRecordPath(path: string): boolean {
  return (
    RECORD_PATH.test(path) ||
    (STORE_RECORD.test(path) && existsSync(join(dirname(dirname(dirname(path))), "store.json")))
  );
}

/** The session's task state on a branch: the attach, detach, focus, hold and confirm entries in order. */
export function foldState(branch: readonly any[]): TaskState {
  const attached: string[] = [];
  const held = new Set<string>();
  let focus: string | undefined;
  for (const entry of branch ?? []) {
    if (entry?.type !== "custom" || entry.customType !== TASK_ENTRY) continue;
    const { op, record } = (entry.data ?? {}) as { op?: Op; record?: unknown };
    if (typeof record !== "string") continue;
    const index = attached.indexOf(record);
    if (op === "attach") {
      if (index < 0) attached.push(record);
      held.delete(record);
      focus = record;
    } else if (op === "detach" && index >= 0) {
      attached.splice(index, 1);
      held.delete(record);
      if (focus === record) focus = undefined;
    } else if (op === "focus" && index >= 0) focus = record;
    else if (op === "hold" && index >= 0) held.add(record);
    else if (op === "confirm") held.delete(record);
  }
  return { attached, held: [...held], focus };
}

function sameState(a: TaskState, b: TaskState): boolean {
  return (
    a.focus === b.focus && a.attached.join("\n") === b.attached.join("\n") && a.held.join("\n") === b.held.join("\n")
  );
}

function option(command: string, name: string): string | undefined {
  const match = new RegExp(`${name}(?:=|\\s+)(?:"([^"]+)"|'([^']+)'|(\\S+))`).exec(command);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

/** A path with its symlinks resolved; for a path that does not exist yet, its nearest existing ancestor's. */
export function canonicalPath(path: string): string {
  const missing: string[] = [];
  for (let current = resolve(path); ;) {
    try {
      return join(realpathSync(current), ...missing);
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

/**
 * The Working Record files a tool call would write, resolved to absolute paths. A path to an attached record by another
 * route (the project link, a symlinked home) is returned as the attached path, so the gate sees one file as one record.
 */
export function recordTargets(toolName: string, input: any, cwd: string, attached: readonly string[]): string[] {
  const asAttached = (path: string) => {
    if (attached.includes(path)) return path;
    const real = canonicalPath(path);
    return attached.find((item) => canonicalPath(item) === real) ?? path;
  };
  // As Pi's tools read a path: a leading @ dropped, ~ for the home directory.
  const expand = (path: string) => {
    const bare = path.startsWith("@") ? path.slice(1) : path;
    return bare === "~" ? homedir() : bare.startsWith("~/") ? join(homedir(), bare.slice(2)) : bare;
  };
  const absolute = (path: string, base = cwd) => {
    const bare = expand(path);
    return asAttached(isAbsolute(bare) ? resolve(bare) : resolve(base, bare));
  };
  const isTarget = (path: string) => isRecordPath(path) || attached.includes(path);
  if ((toolName === "edit" || toolName === "write") && typeof input?.path === "string") {
    const path = absolute(input.path);
    return isTarget(path) ? [path] : [];
  }
  if (toolName === "apply_patch" && typeof input?.input === "string") {
    const paths = [...input.input.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((match) =>
      absolute(match[1].trim()),
    );
    return paths.filter(isTarget);
  }
  if (toolName === "bash" && typeof input?.command === "string") {
    const targets: string[] = [];
    // Each command segment that writes a record, after expanding variables assigned earlier in the same command, so
    // `S=<script>; R=<record>; node $S decision add --record "$R"` is seen like the literal form.
    for (const segment of expandAssignments(input.command).split(/;|&&|\|\||\||\n/)) {
      // A help request writes nothing; Track Work tells agents to read it before preparing input.
      if (!RECORD_WRITE.test(segment) || /(^|\s)--help(\s|$)/.test(segment)) continue;
      const record = option(segment, "--record");
      if (!record || /[$`*?]/.test(record)) targets.push(`${UNRESOLVED_TARGET}${record ?? "(no --record)"}`);
      else if (/^[a-z0-9-]+\/task-\d+$/.test(record)) targets.push(`${ID_TARGET}${record}`);
      else {
        const root = option(segment, "--root");
        targets.push(absolute(record, root && !/[$`]/.test(root) ? absolute(root) : cwd));
      }
    }
    return targets;
  }
  return [];
}

/**
 * Replace $NAME and ${NAME} with the value last assigned as NAME=value before that point in the same command, as the
 * shell would; others stay as they are.
 */
function expandAssignments(command: string): string {
  const assignments = [
    ...command.matchAll(/(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s;&|]*))/g),
  ].map((match) => ({
    name: match[1],
    value: match[2] ?? match[3] ?? match[4] ?? "",
    end: match.index! + match[0].length,
  }));
  return command.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (whole, braced, bare, offset: number) => {
      let value: string | undefined;
      for (const assignment of assignments)
        if (assignment.name === (braced ?? bare) && assignment.end <= offset) value = assignment.value;
      return value ?? whole;
    },
  );
}

export class TaskMemory {
  private current: TaskState = { attached: [], held: [] };
  /** This branch's task entries, in order; a write adds one and folds again. */
  private entries: any[] = [];
  private names = new Map<string, string>();
  /** Registered records' IDs by path, for the Runtime State. */
  private ids = new Map<string, string>();
  private lib: Promise<any> | undefined;
  readonly registry: Registry;

  constructor(private readonly host: TaskMemoryHost) {
    this.registry = host.registry ?? new Registry(host.packageRoot);
  }

  state(): TaskState {
    return this.current;
  }

  /** Rebuild from the branch. Returns whether the state changed. */
  rebuild(branch: readonly any[]): boolean {
    this.entries = (branch ?? []).filter((entry) => entry?.type === "custom" && entry.customType === TASK_ENTRY);
    const next = foldState(this.entries);
    const changed = !sameState(this.current, next);
    this.current = next;
    return changed;
  }

  /** Learn the attached records' names and IDs, for the Runtime State. */
  async load(): Promise<void> {
    for (const record of this.current.attached) {
      await this.read(record);
      const found = await this.registered(record);
      if (found) this.ids.set(record, found.id);
    }
  }

  private write(op: Op, record: string): void {
    const data = { op, record, at: new Date().toISOString() };
    this.host.append(data);
    this.entries.push({ type: "custom", customType: TASK_ENTRY, data });
    this.current = foldState(this.entries);
  }

  private script(): string {
    return join(this.host.packageRoot, "skills", "track-work", "scripts", "working-record.mjs");
  }

  private async views(): Promise<any> {
    this.lib ??= import(pathToFileURL(join(this.host.packageRoot, "skills/track-work/scripts/lib/views.mjs")).href);
    return this.lib;
  }

  name(record: string): string {
    return this.names.get(record) ?? basename(dirname(record));
  }

  private label(record: string): string {
    const id = this.ids.get(record);
    return id ? `${this.name(record)} [${id}]` : this.name(record);
  }

  private async read(record: string): Promise<{ text?: string; error?: string }> {
    try {
      const text = await readFile(record, "utf8");
      const heading = /^# Working Record:\s*(.+?)\s*$/m.exec(text);
      if (heading) this.names.set(record, heading[1]);
      return { text };
    } catch (error: any) {
      return { error: error?.code === "ENOENT" ? "the file does not exist" : String(error?.message ?? error) };
    }
  }

  /** The registry entry for a record path, or undefined when unregistered or the registry is unreadable. */
  private async registered(record: string): Promise<{ id: string; task: RegisteredTask } | undefined> {
    try {
      return await this.registry.byRecord(record);
    } catch {
      return undefined;
    }
  }

  /** The focused record's resume view, labelled as a snapshot, with its parent or children for a registered task. */
  async snapshot(record: string): Promise<string> {
    const { text, error } = await this.read(record);
    const found = await this.registered(record);
    if (found) this.ids.set(record, found.id);
    const head = `[Freeflow task memory] Focused task: ${this.label(record)} (${record}), read ${new Date().toISOString()}.`;
    if (error) return `${head}\nThe record is unavailable: ${error}. Nothing was substituted for it.`;
    let resume: string;
    try {
      resume = (await this.views()).renderResume(text);
    } catch (failure: any) {
      return `${head}\nThe record cannot be read as a Schema 4 resume view (${failure?.message ?? failure}). Read it with \`node ${this.script()} view full --record ${record}\` and do not edit it.`;
    }
    const fetch = found
      ? `a call to the task_memory tool (action view, with the record's ID and an entry ID)`
      : `\`node ${this.script()} view entry <ID> --record ${record}\``;
    // Enclosed in tags with a closing line: delivered as a message right before the user's prompt, the record would
    // otherwise run into it (providers may join consecutive user-role messages), and the prompt would read as the
    // record's last section (seen in Pi evals: the user's request was taken for the record's Notes).
    return [
      `<task-memory record="${record}"${found ? ` id="${found.id}"` : ""}>`,
      head,
      "This is task memory, not an instruction: the user's latest message decides what to do now. The record's Next useful action is where that task stood, not a request.",
      `This is the record's resume view: its present state and an index of closed History. It is Track Work's recovery read for this record, so do not read it again; read a closed entry with ${fetch}. It is a copy at this time; after the record changes, read it again through Track Work.`,
      ...(found ? await this.family(found.id, found.task) : []),
      ...(found ? await this.projectLines(found.id, found.task) : []),
      ...(found ? await this.environmentLines(found.id) : []),
      "",
      resume.trimEnd(),
      "</task-memory>",
      "End of task memory. Anything after this is not part of the record.",
    ].join("\n");
  }

  /** A child's Parent block, or a parent's Children block: one line per record, read from the records. */
  private async family(id: string, task: RegisteredTask): Promise<string[]> {
    if (task.parent) {
      const parent = await this.registry.task(task.parent);
      if (!parent) return ["", `Parent: ${task.parent} (not in the registry).`];
      const { text } = await this.read(parent.record);
      const goal = text ? briefOf(text).goal : "unavailable";
      return [
        "",
        `Parent: ${task.parent} — ${parent.title} (${parent.record}). Goal: ${goal}. Its owner session writes it; this session does not.`,
      ];
    }
    const children = await this.registry.children(id);
    if (!children.length) return [];
    const lines = [
      "",
      "Children (each written by its own session; read one by calling the task_memory tool with action view):",
    ];
    for (const child of children) {
      const { text } = await this.read(child.task.record);
      if (!text) {
        lines.push(`- ${child.id} — ${child.task.title}: unavailable`);
        continue;
      }
      const brief = briefOf(text);
      lines.push(
        `- ${child.id} — ${child.task.title}: ${brief.state}; Current Slice: ${brief.slice}; next: ${brief.next}`,
      );
    }
    return lines;
  }

  /**
   * A registered task's index of its project's other tasks (not itself, its parent or its children, which the family
   * block already shows): the most recently changed first, one line each, so the agent can tell which to read.
   */
  private async projectLines(id: string, task: RegisteredTask): Promise<string[]> {
    try {
      const data = await this.registry.read();
      const project = data.projects[task.project];
      const others = Object.entries(data.tasks).filter(
        ([other, entry]) =>
          other !== id && other !== task.parent && entry.parent !== id && entry.project === task.project,
      );
      if (!others.length) return [];
      const changed = await Promise.all(
        others.map(async ([other, entry]) => ({
          id: other,
          entry,
          at: await stat(entry.record)
            .then((info) => info.mtimeMs)
            .catch(() => 0),
        })),
      );
      changed.sort((a, b) => b.at - a.at);
      const lines = [
        "",
        `Project ${project?.name ?? task.project}, other tasks (most recently changed first; read one by calling the task_memory tool with action view, or search them with action search and scope project):`,
      ];
      for (const item of changed.slice(0, PROJECT_INDEX_LIMIT)) {
        const { text } = await this.read(item.entry.record);
        const state = text ? briefOf(text).state : "unavailable";
        lines.push(
          `- ${item.id} ${state} — ${item.entry.title}${item.entry.parent ? ` (child of ${item.entry.parent})` : ""}`,
        );
      }
      if (changed.length > PROJECT_INDEX_LIMIT)
        lines.push(
          `- … ${changed.length - PROJECT_INDEX_LIMIT} more: list them with the task_memory tool's list action, or search the project.`,
        );
      return lines;
    } catch {
      return [];
    }
  }

  /** A record named by task ID, path, or task directory. */
  private async locate(record: unknown, cwd: string): Promise<{ path?: string; id?: string; error?: string }> {
    if (typeof record !== "string" || !record.trim()) return { error: "Name the task's ID or its record.md." };
    const name = record.trim();
    if (TASK_ID.test(name)) {
      let task: RegisteredTask | undefined;
      try {
        task = await this.registry.task(name);
      } catch (error: any) {
        return { error: error?.message ?? String(error) };
      }
      if (!task) return { error: `No task ${name} in the registry.` };
      await this.read(task.record);
      this.ids.set(task.record, name);
      return { path: task.record, id: name };
    }
    let path = isAbsolute(name) ? resolve(name) : resolve(cwd, name);
    try {
      if ((await stat(path)).isDirectory()) path = join(path, "record.md");
      if (!(await stat(path)).isFile()) return { error: `${path} is not a file.` };
    } catch {
      return { error: `${path} does not exist.` };
    }
    if (basename(path) !== "record.md") return { error: `${path} is not a Working Record (record.md).` };
    // A registered record named through the project link is the registry's path, as a task ID would give.
    const found = await this.registered(path);
    if (found) path = found.task.record;
    await this.read(path);
    if (found) this.ids.set(path, found.id);
    return { path, id: found?.id };
  }

  /** Take ownership of a registered record, asking the user before taking it from another session. */
  private async own(id: string, takeover: boolean): Promise<string | undefined> {
    try {
      const result = await this.registry.own(id, this.host.owner(), takeover);
      if (result.owned === true) return undefined;
      const { by } = result as { by: Owner };
      const yes = await this.host.confirm(
        `Take over ${id}?`,
        `${id} is owned by session ${by.session}${by.file ? ` (${by.file})` : ""} since ${by.since}. Take it over? That session's writes to it will then be refused.`,
      );
      if (!yes) return `${id} is owned by session ${by.session}; it was not taken over, so it is not attached.`;
      await this.registry.own(id, this.host.owner(), true);
      return undefined;
    } catch (error: any) {
      return String(error?.message ?? error);
    }
  }

  async attach(record: unknown, cwd: string): Promise<TaskResult> {
    const { path, id, error } = await this.locate(record, cwd);
    if (!path) return { ok: false, text: error! };
    if (id) {
      const refused = await this.own(id, false);
      if (refused) return { ok: false, text: refused };
    }
    this.write("attach", path);
    return { ok: true, text: await this.snapshot(path), snapshot: path };
  }

  private async attachedMatch(record: unknown, cwd: string): Promise<string | undefined> {
    if (typeof record !== "string") return undefined;
    const direct = resolve(cwd, record);
    const match = this.current.attached.find((item) => item === direct || item === join(direct, "record.md"));
    if (match) return match;
    // The same record through the project link.
    const real = canonicalPath(direct.endsWith("record.md") ? direct : join(direct, "record.md"));
    const linked = this.current.attached.find((item) => canonicalPath(item) === real);
    if (linked) return linked;
    if (TASK_ID.test(record.trim())) {
      const { path } = await this.locate(record, cwd);
      return path && this.current.attached.includes(path) ? path : undefined;
    }
    return undefined;
  }

  async focus(record: unknown, cwd: string): Promise<TaskResult> {
    const match = await this.attachedMatch(record, cwd);
    if (!match) return { ok: false, text: `${record} is not attached. ${this.attachedText()}` };
    if (this.current.focus !== match) this.write("focus", match);
    return { ok: true, text: await this.snapshot(match), snapshot: match };
  }

  async detach(record: unknown, cwd: string): Promise<TaskResult> {
    const match = await this.attachedMatch(record, cwd);
    if (!match) return { ok: false, text: `${record} is not attached. ${this.attachedText()}` };
    this.write("detach", match);
    const id = this.ids.get(match);
    if (id) await this.registry.release(id, this.host.owner().session).catch(() => {});
    return { ok: true, text: `Detached ${this.label(match)} (${match}). ${this.attachedText()}` };
  }

  /** Release held records, one or all, taking ownership of registered ones: the user's command is the confirmation. */
  async confirm(record: unknown, cwd: string): Promise<TaskResult> {
    const named = typeof record === "string" && record.trim();
    const path = named ? await this.attachedMatch(record as string, cwd) : undefined;
    if (named && !path) return { ok: false, text: `${record} is not attached to this session. ${this.attachedText()}` };
    const targets = this.current.held.filter((item) => !path || item === path);
    if (!targets.length) return { ok: false, text: "No held record matches." };
    for (const item of targets) {
      const id = this.ids.get(item) ?? (await this.registered(item))?.id;
      if (id) {
        const refused = await this.own(id, true);
        if (refused) return { ok: false, text: refused };
      }
      this.write("confirm", item);
    }
    return { ok: true, text: `Writable again: ${targets.map((item) => this.label(item)).join(", ")}.` };
  }

  /** After a fork or clone: inherited records stay listed and readable but not writable until confirmed. */
  holdInherited(): string[] {
    const inherited = this.current.attached.filter((item) => !this.current.held.includes(item));
    for (const item of inherited) this.write("hold", item);
    return inherited;
  }

  /** Create a task in this repository's project. It is not attached; the agent proposes that next. */
  async create(title: unknown, goal: unknown, cwd: string): Promise<TaskResult> {
    if (typeof title !== "string" || !title.trim()) return { ok: false, text: "Give the task a title." };
    try {
      const project = await this.registry.projectFor(cwd);
      if (!project)
        return {
          ok: false,
          text: "This repository is not linked to a project. The user creates one with /freeflow project new <name>.",
        };
      const created = await this.registry.createTask(
        project.slug,
        title.trim(),
        String(goal || title).trim(),
        undefined,
        await this.registry.repoRoot(cwd),
      );
      return {
        ok: true,
        id: created.id,
        headline: `Created ${created.id} — ${title.trim()}`,
        text: `Created ${created.id} (${created.record}). It is not attached; propose attaching it with task_memory.`,
      };
    } catch (error: any) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }

  /** Where a registered task's work happens, and a warning when this session runs elsewhere. */
  private async environmentLines(id: string): Promise<string[]> {
    try {
      const env = await this.registry.environment(id);
      if (!env.primary) return [];
      const facts =
        env.exists === false
          ? ["missing"]
          : [env.worktree ? "Git worktree" : "", env.branch ? `branch ${env.branch}` : ""];
      const state = facts.filter(Boolean).join(", ");
      const lines = [
        "",
        `Environment: ${env.primary}${state ? ` (${state})` : ""}${env.directories.length ? `; also ${env.directories.join(", ")}` : ""}.`,
      ];
      const here = resolve(this.host.cwd());
      if (here !== env.primary && !here.startsWith(env.primary + sep))
        lines.push(
          `This session runs in ${here}, outside this task's directory; the task's effects belong in ${env.primary}.`,
        );
      return lines;
    } catch {
      return [];
    }
  }

  /**
   * The Track Work command that records a delegation in the parent's record, ready to run: the split already happened
   * (the user confirmed it), so it is a retroactive Slice. Adjust its wording, not its shape.
   */
  private delegation(parent: string, child: string, title: string, result: string): string {
    // The user's calendar day, as Track Work's own Recorded date uses.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return [
      `Record the split in ${parent}'s record now, with this Track Work command (edit the wording if needed; then update ${parent}'s Next useful action if this session should not do that work):`,
      "",
      // Single quotes, so a title with $(…) or backticks is text, not a command the shell runs.
      `node ${this.script()} slice record --record ${parent} --title '${`Split off: ${title}`.replaceAll("'", "'\\''")}' --state completed --input - <<'EOF'`,
      `- Occurred: ${today}`,
      `- Intended result: ${title} continues in its own session as ${child}.`,
      `- Authority source: The user confirmed the split in Freeflow's dialog.`,
      `- Result: ${result}`,
      `- Evidence and limits: The split's tool result; ${child}'s session has not started.`,
      `- Task effect: ${title} is done in ${child}'s session; this session reads its record when the result matters.`,
      "EOF",
    ].join("\n");
  }

  /**
   * Fan the focused task out into a child with its own worktree, for a parallel session the user starts there. Only the
   * focused task's owner may.
   */
  async fanout(title: unknown, goal: unknown, parent?: string): Promise<TaskResult> {
    if (typeof title !== "string" || !title.trim()) return { ok: false, text: "Give the child a title." };
    try {
      let parentId = parent;
      if (!parentId) {
        const focus = this.current.focus;
        const found = focus ? await this.registered(focus) : undefined;
        if (!found) return { ok: false, text: "The focus is not a registered task, so it cannot fan out." };
        if (found.task.owner?.session !== this.host.owner().session)
          return { ok: false, text: `Only the owner of ${found.id} fans it out.` };
        parentId = found.id;
      }
      const result = await this.registry.fanout(parentId, title.trim(), String(goal || title).trim(), {
        cwd: this.host.cwd(),
      });
      if (result.error) return { ok: false, text: result.error };
      const command = await this.registry.startCommand(result.path!, "pi");
      return {
        ok: true,
        id: result.id,
        command,
        headline: `Child ${result.id} ready in ${result.path}`,
        text: `Created child ${result.id} of ${parentId} with a worktree at ${result.path} on branch ${result.branch}${result.copiedConfig ? " (personal Freeflow config copied)" : ""}. To start it, the user opens a new terminal and runs:\n\n    ${command}\n\nShow the user that command exactly. Freeflow in that session offers to attach ${result.id}.\n\n${this.delegation(parentId, result.id, title.trim(), `Created ${result.id} with a worktree at ${result.path} on branch ${result.branch}.`)}`,
      };
    } catch (error: any) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }

  /** The task this session's directory belongs to, when nothing is attached and the user has not declined it here. */
  async suggestion(branch: readonly any[]): Promise<{ id: string; title: string; record: string } | undefined> {
    if (!this.host.effective() || this.current.attached.length) return undefined;
    try {
      const declined = new Set(
        branch
          .filter(
            (entry) => entry?.type === "custom" && entry.customType === TASK_ENTRY && entry.data?.op === "decline",
          )
          .map((entry) => entry.data?.record),
      );
      const found = (await this.registry.here(this.host.cwd())).find(({ task }) => !declined.has(task.record));
      return found ? { id: found.id, title: found.task.title, record: found.task.record } : undefined;
    } catch {
      return undefined;
    }
  }

  decline(record: string): void {
    this.write("decline", record);
  }

  /** Create a child of a registered task. From the model, the parent is the focus and this session must own it. */
  async child(title: unknown, goal: unknown, parent?: string): Promise<TaskResult> {
    if (typeof title !== "string" || !title.trim()) return { ok: false, text: "Give the child a title." };
    try {
      let parentId = parent;
      if (!parentId) {
        const focus = this.current.focus;
        const found = focus ? await this.registered(focus) : undefined;
        if (!found) return { ok: false, text: "The focus is not a registered task, so it cannot have children." };
        if (found.task.owner?.session !== this.host.owner().session)
          return { ok: false, text: `Only the owner of ${found.id} creates its children.` };
        parentId = found.id;
      }
      const task = await this.registry.task(parentId);
      if (!task) return { ok: false, text: `No task ${parentId} in the registry.` };
      const created = await this.registry.createTask(
        task.project,
        title.trim(),
        String(goal || title).trim(),
        parentId,
      );
      return {
        ok: true,
        id: created.id,
        headline: `Created child ${created.id} of ${parentId}`,
        text: `Created child ${created.id} of ${parentId} (${created.record}). The user works it in a new session with /freeflow task attach ${created.id}.\n\n${this.delegation(parentId, created.id, title.trim(), `Created ${created.id} (${created.record}).`)}`,
      };
    } catch (error: any) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }

  /** A record's resume view, or one entry, by task ID or path. */
  async view(record: unknown, entry: unknown, cwd: string): Promise<TaskResult> {
    const { path, error } = await this.locate(record, cwd);
    if (!path) return { ok: false, text: error! };
    const { text, error: readError } = await this.read(path);
    if (!text) return { ok: false, text: `${path} is unavailable: ${readError}.` };
    try {
      const views = await this.views();
      if (typeof entry === "string" && entry.trim())
        return { ok: true, text: views.renderEntries(text, [entry.trim()]) };
      // A registered task reads as its delivered view does: parent or children, the project's other tasks, and where
      // its work happens, before the resume view.
      const found = await this.registered(path);
      const blocks = found
        ? [
            ...(await this.family(found.id, found.task)),
            ...(await this.projectLines(found.id, found.task)),
            ...(await this.environmentLines(found.id)),
          ]
        : [];
      const resume = views.renderResume(text);
      return { ok: true, text: blocks.length ? `${blocks.join("\n").trimStart()}\n\n${resume}` : resume };
    } catch (failure: any) {
      return { ok: false, text: String(failure?.message ?? failure) };
    }
  }

  /** Lines matching the query in the focused record, its task tree, or its project, through Track Work's search. */
  async search(query: unknown, scope: unknown, cwd: string): Promise<TaskResult> {
    if (typeof query !== "string" || !query.trim()) return { ok: false, text: "Give a query." };
    const focus = this.current.focus;
    try {
      const found = focus ? await this.registered(focus) : undefined;
      let records: [string, string][];
      if (found) records = await this.registry.scope(found.id, typeof scope === "string" ? scope : "task");
      else if (scope === "project") {
        const project = await this.registry.projectFor(cwd);
        if (!project)
          return { ok: false, text: "No project: the focus is unregistered and this repository is not linked to one." };
        records = (await this.registry.projectTasks(project.slug)).map(({ id, task }) => [id, task.record]);
      } else if (scope === "tree") return { ok: false, text: "The focus is not a registered task, so it has no tree." };
      else if (focus) records = [[this.name(focus), focus]];
      else return { ok: false, text: "Nothing is in focus." };
      const { searchRecords } = await import(
        pathToFileURL(join(this.host.packageRoot, "skills/track-work/scripts/lib/search.mjs")).href
      );
      return { ok: true, text: await searchRecords(records, query) };
    } catch (error: any) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }

  /** Move an unregistered record into a project's store and register it; the user confirmed before this. */
  async importRecord(record: unknown, projectName: unknown, cwd: string): Promise<TaskResult> {
    const { path, id, error } = await this.locate(record, cwd);
    if (!path) return { ok: false, text: error! };
    if (id) return { ok: false, text: `${path} is already registered as ${id}.` };
    if (typeof projectName !== "string" || !projectName.trim()) return { ok: false, text: "Name the project." };
    try {
      const moved = await this.registry.importRecord(projectName.trim(), path);
      if (this.current.attached.includes(path)) {
        this.write("detach", path);
        this.ids.set(moved.record, moved.id);
        const refused = await this.own(moved.id, false);
        if (!refused) this.write("attach", moved.record);
      }
      return { ok: true, text: `Imported as ${moved.id} (${moved.record}).` };
    } catch (error: any) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }

  /** This repository's project tasks and records under .freeflow/tasks, then attached records from elsewhere. */
  async records(cwd: string): Promise<string[]> {
    const found: string[] = [];
    try {
      const project = await this.registry.projectFor(cwd);
      if (project)
        for (const { id, task } of await this.registry.projectTasks(project.slug)) {
          this.ids.set(task.record, id);
          if ((await this.read(task.record)).text !== undefined) found.push(task.record);
        }
    } catch {
      // An unreadable registry leaves only unregistered records.
    }
    const local: string[] = [];
    try {
      for (const entry of await readdir(join(cwd, ".freeflow", "tasks"), { withFileTypes: true })) {
        const record = join(cwd, ".freeflow", "tasks", entry.name, "record.md");
        if (entry.isDirectory() && (await this.read(record)).text !== undefined) local.push(record);
      }
    } catch {
      // No tasks directory.
    }
    return [...new Set([...found, ...local.sort(), ...this.current.attached])];
  }

  /** Every project in the registry, marking the one this repository is linked to. */
  async projects(cwd: string): Promise<TaskResult> {
    try {
      const data = await this.registry.read();
      const here = await this.registry.projectFor(cwd).catch((): undefined => undefined);
      const entries = Object.entries(data.projects);
      if (!entries.length)
        return {
          ok: true,
          headline: "No projects",
          text: "No projects yet. A project is created with the user's confirmation.",
        };
      const count = (slug: string) => Object.values(data.tasks).filter((task) => task.project === slug).length;
      return {
        ok: true,
        headline: `${entries.length} project${entries.length === 1 ? "" : "s"}`,
        text: entries
          .map(
            ([slug, project]) =>
              `- ${project.name} (${slug})${here?.slug === slug ? ", linked to this repository" : ""}: ${count(slug)} task(s); repositories ${project.repos.join(", ")}`,
          )
          .join("\n"),
      };
    } catch (error: any) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }

  /** Create a project and link this repository, or link this repository to an existing one; the user confirmed. */
  async project(operation: "new" | "link", name: unknown, worktrees: unknown, cwd: string): Promise<TaskResult> {
    if (typeof name !== "string" || !name.trim()) return { ok: false, text: "Name the project." };
    const where = typeof worktrees === "string" && worktrees.trim() ? worktrees.trim() : undefined;
    try {
      const slug =
        operation === "new"
          ? await this.registry.createProject(name.trim(), cwd, where)
          : await this.registry.linkProject(name.trim(), cwd, where);
      const repo = await this.registry.repoRoot(cwd);
      const link = join(repo, ".freeflow", "project");
      const browse = existsSync(link) ? ` The user can browse its records at ${link}.` : "";
      const text =
        operation === "new"
          ? `Project ${slug} created and linked to ${repo}.${browse}`
          : `${repo} is linked to project ${slug}.${browse}`;
      return { ok: true, headline: text, text };
    } catch (error: any) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }

  /** Removal names a registered task by ID, or a project by name (Task 006). */
  private removalTarget(target: { task?: unknown; project?: unknown }): {
    target?: { task?: string; project?: string };
    error?: string;
  } {
    const task = typeof target.task === "string" ? target.task.trim() : "";
    const project = typeof target.project === "string" ? target.project.trim() : "";
    if (project) return { target: { project } };
    if (!task) return { error: "Name the task's ID, or the project." };
    if (!TASK_ID.test(task))
      return {
        error: `${task} is not a task ID: only registered tasks (such as my-project/task-003) and projects can be removed.`,
      };
    return { target: { task } };
  }

  /** The question to put to the user before removing a task or a project, or why it cannot be removed. */
  async removalQuestion(target: { task?: unknown; project?: unknown }): Promise<{ question?: string; error?: string }> {
    const { target: named, error } = this.removalTarget(target);
    if (!named) return { error };
    try {
      const plan = await this.registry.removal(named);
      const [first, ...children] = plan.tasks;
      const what = plan.project
        ? `project ${plan.project.name} and its ${plan.tasks.length} task(s)`
        : `${first.id} "${first.title}"${children.length ? ` and its children ${children.map((task) => task.id).join(", ")}` : ""}`;
      const me = this.host.owner().session;
      const others = plan.tasks.filter((task) => task.owner && task.owner !== me);
      return {
        question: [
          `Remove ${what}? The records move to the trash; only you can empty it, with /freeflow trash empty.`,
          ...(others.length
            ? [`Owned by other sessions: ${others.map((task) => `${task.id} (session ${task.owner})`).join(", ")}.`]
            : []),
          ...(plan.worktrees.length ? [`Git worktrees stay: ${plan.worktrees.map((w) => w.path).join(", ")}.`] : []),
        ].join(" "),
      };
    } catch (failure: any) {
      return { error: failure?.message ?? String(failure) };
    }
  }

  /** Remove a task with its children, or a project; the user confirmed. Removed records are detached here. */
  async remove(target: { task?: unknown; project?: unknown }): Promise<TaskResult> {
    const { target: named, error } = this.removalTarget(target);
    if (!named) return { ok: false, text: error! };
    try {
      const plan = await this.registry.removal(named);
      const records = (await Promise.all(plan.tasks.map((task) => this.registry.task(task.id))))
        .map((task) => task?.record)
        .filter((record): record is string => typeof record === "string");
      const result = named.task
        ? await this.registry.removeTask(named.task)
        : await this.registry.removeProject(named.project!);
      for (const record of records) if (this.current.attached.includes(record)) this.write("detach", record);
      return {
        ok: true,
        headline: `Removed ${result.project ? `project ${result.project.name}` : result.tasks[0].id}${result.tasks.length > (result.project ? 0 : 1) ? ` and ${result.tasks.length - (result.project ? 0 : 1)} task(s)` : ""} · in the trash`,
        text: await this.registry.removalText(result),
      };
    } catch (failure: any) {
      return { ok: false, text: failure?.message ?? String(failure) };
    }
  }

  /** A registered task's directories, or a change to them; the user confirmed a change. */
  async environment(
    record: unknown,
    change: { primary?: string; add?: string; remove?: string },
    cwd: string,
  ): Promise<TaskResult> {
    const { id, error } = await this.locate(record, cwd);
    if (error) return { ok: false, text: error };
    if (!id) return { ok: false, text: `${record} is not a registered task, so it has no recorded directories.` };
    try {
      if (change.primary || change.add || change.remove) await this.registry.setEnvironment(id, change);
      const lines = (await this.environmentLines(id)).filter(Boolean);
      return {
        ok: true,
        headline: lines[0] ?? `${id} has no directory recorded`,
        text: lines.length ? lines.join("\n") : `${id} has no directory recorded.`,
      };
    } catch (failure: any) {
      return { ok: false, text: failure?.message ?? String(failure) };
    }
  }

  /** This repository's records (see records()), or a named project's tasks. */
  async list(cwd: string, project?: unknown): Promise<string> {
    let records: string[];
    if (typeof project === "string" && project.trim()) {
      const found = await this.registry.project(project.trim());
      if (!found) return `No project named ${project.trim()}.`;
      records = [];
      for (const { id, task } of await this.registry.projectTasks(found.slug)) {
        this.ids.set(task.record, id);
        records.push(task.record);
      }
      if (!records.length) return `Project ${found.project.name} has no tasks yet.`;
    } else records = await this.records(cwd);
    const lines: string[] = [];
    for (const record of records) {
      const { text } = await this.read(record);
      if (text === undefined && !this.current.attached.includes(record)) continue;
      const state = text ? briefOf(text).state : "unavailable";
      const role =
        this.current.focus === record
          ? ", focus"
          : this.current.held.includes(record)
            ? ", attached (held)"
            : this.current.attached.includes(record)
              ? ", attached"
              : "";
      const found = this.ids.has(record) ? await this.registered(record) : undefined;
      const owner = found?.task.owner
        ? found.task.owner.session === this.host.owner().session
          ? ", owned here"
          : ", owned by another session"
        : "";
      const parent = found?.task.parent ? `, child of ${found.task.parent}` : "";
      lines.push(`- ${this.label(record)} — ${record} (${state}${role}${owner}${parent})`);
    }
    return lines.length ? lines.join("\n") : "No Working Records found for this repository and none attached.";
  }

  /** A record's label, task state and Next useful action, for one-line displays. */
  async brief(record: string): Promise<{ label: string; state: string; next: string }> {
    const { text } = await this.read(record);
    const brief = text ? briefOf(text) : { state: "unavailable", next: "" };
    return { label: this.label(record), state: brief.state, next: brief.next };
  }

  attachedText(): string {
    if (!this.current.attached.length) return "No task record is attached.";
    return `Attached: ${this.current.attached.map((item) => this.label(item)).join(", ")}.`;
  }

  /** Lines for the Runtime State, or undefined when task memory is off. */
  runtimeLines(): string[] | undefined {
    if (!this.host.effective()) return undefined;
    const { attached, held, focus } = this.current;
    if (!attached.length)
      return [
        "Task Memory:",
        "- Attached: none. Propose attaching a record with task_memory only when Track Work calls for one.",
      ];
    return [
      "Task Memory:",
      ...attached.map(
        (item) =>
          `- ${item === focus ? "Focus" : "Attached"}: ${this.label(item)} (\`${item}\`)${held.includes(item) ? ", held: not writable until the user confirms" : ""}`,
      ),
      ...(focus ? [] : ["- Focus: none"]),
    ];
  }

  /** A refusal for a tool call that would write a record this session has not attached, or does not own. */
  async gate(toolName: string, input: any, cwd: string): Promise<{ block: true; reason: string } | undefined> {
    if (!this.host.effective()) return undefined;
    if (toolName === "bash" && typeof input?.command === "string") {
      const changes = (segment: string) =>
        (REGISTRY_CHANGE.test(segment) || ENVIRONMENT_CHANGE.test(segment)) && !/(^|\s)--help(\s|$)/.test(segment);
      if (
        expandAssignments(input.command)
          .split(/;|&&|\|\||\||\n/)
          .some(changes)
      )
        return {
          block: true,
          reason:
            "Task memory: creating, fanning out or removing tasks, creating, linking or removing projects, and changing a task's directories go through the task_memory tool, which asks the user. Use its action; do not run Track Work's command for it.",
        };
    }
    for (const named of recordTargets(toolName, input, cwd, this.current.attached)) {
      if (named.startsWith(UNRESOLVED_TARGET))
        return {
          block: true,
          reason: `Task memory: this Track Work command writes a record whose path cannot be read from the command (${named.slice(UNRESOLVED_TARGET.length)}), so it cannot be checked against the records attached to this session. Run it with a literal --record path or task ID.`,
        };
      let target = named;
      if (named.startsWith(ID_TARGET)) {
        const task = await this.registry.task(named.slice(ID_TARGET.length)).catch((): undefined => undefined);
        if (!task) continue;
        target = task.record;
      }
      if (!this.current.attached.includes(target))
        return {
          block: true,
          reason: `Task memory: ${target} is not attached to this session, so it cannot be written. ${this.attachedText()} Propose attaching it with task_memory, or ask the user; do not write it another way.`,
        };
      if (this.current.held.includes(target))
        return {
          block: true,
          reason: `Task memory: ${target} was inherited by a fork or clone and is held. Only the user releases it, with /freeflow task confirm; do not write it another way.`,
        };
      let found: { id: string; task: RegisteredTask } | undefined;
      try {
        found = await this.registry.byRecord(target);
      } catch (error: any) {
        // Without the registry, ownership of a stored record is unknown: refuse rather than risk two writers.
        if (target.startsWith(freeflowHome() + sep))
          return {
            block: true,
            reason: `Task memory: ${error?.message ?? error} Ownership of ${target} cannot be checked, so it cannot be written until the registry is repaired.`,
          };
      }
      if (found && found.task.owner?.session !== this.host.owner().session)
        return {
          block: true,
          reason: `Task memory: ${found.id} is owned by ${found.task.owner ? `session ${found.task.owner.session}` : "no session"}, not this one, so this session cannot write it. The user takes it over with /freeflow task attach ${found.id}; do not write it another way.`,
        };
    }
    return undefined;
  }

  /** Whether the branch already holds a snapshot of the record since its latest compaction. */
  delivered(branch: readonly any[], record: string): boolean {
    let start = 0;
    for (let index = branch.length - 1; index >= 0; index--)
      if (branch[index]?.type === "compaction") {
        start = index + 1;
        break;
      }
    return branch
      .slice(start)
      .some(
        (entry) =>
          (entry?.type === "custom_message" &&
            entry.customType === SNAPSHOT_TYPE &&
            entry.details?.record === record) ||
          (entry?.type === "message" &&
            entry.message?.role === "toolResult" &&
            entry.message.toolName === "task_memory" &&
            entry.message.details?.snapshot === record),
      );
  }

  /** Deliver the focus's snapshot as a message unless the branch already has one since the latest compaction. */
  async deliver(branch: readonly any[]): Promise<void> {
    const focus = this.current.focus;
    if (!this.host.effective() || !focus || this.delivered(branch, focus)) return;
    this.host.send(await this.snapshot(focus), focus);
  }

  /** The snapshot as a boundary entry, for Freeflow compaction's turn end. */
  async snapshotEntry(): Promise<any | undefined> {
    const focus = this.current.focus;
    if (!this.host.effective() || !focus) return undefined;
    return {
      type: "custom_message",
      customType: SNAPSHOT_TYPE,
      content: await this.snapshot(focus),
      display: true,
      details: { record: focus },
    };
  }
}
