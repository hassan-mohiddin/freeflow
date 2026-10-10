import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { freeflowHome, Registry, RegistryError } from "./registry.js";
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
const TASK_ID = /^[a-z0-9-]+\/task-\d+$/;
const MAX_HITS = 40;
function section(text, heading) {
  const match = new RegExp(`^### ${heading}\\n\\n([\\s\\S]*?)(?=\\n#{2,3} |$)`, "m").exec(text);
  return match?.[1].trim();
}
/** One line about a record: its task state, Current Slice and Next useful action. */
export function briefOf(text) {
  const slice = section(text, "Current Slice") ?? "";
  return {
    state: /^State:\s*(\S+)/m.exec(text)?.[1] ?? "unknown",
    goal: (section(text, "Goal") ?? "").replace(/^- /, "").split("\n")[0],
    slice: /^#### (S-\d+ — .+)$/m.exec(slice)?.[1] ?? "None",
    next: (section(text, "Next useful action") ?? "").replace(/^- /, "").split("\n")[0],
  };
}
const RECORD_PATH = /(^|[\\/])\.freeflow[\\/]tasks[\\/][^\\/]+[\\/]record\.md$/;
const MUTATING = /working-record\.mjs["']?\s+(slice|checkpoint|decision|task)\s+[a-z-]+/;
export function isRecordPath(path) {
  return RECORD_PATH.test(path);
}
/** The session's task state on a branch: the attach, detach, focus, hold and confirm entries in order. */
export function foldState(branch) {
  const attached = [];
  const held = new Set();
  let focus;
  for (const entry of branch ?? []) {
    if (entry?.type !== "custom" || entry.customType !== TASK_ENTRY) continue;
    const { op, record } = entry.data ?? {};
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
function sameState(a, b) {
  return (
    a.focus === b.focus && a.attached.join("\n") === b.attached.join("\n") && a.held.join("\n") === b.held.join("\n")
  );
}
function option(command, name) {
  const match = new RegExp(`${name}(?:=|\\s+)(?:"([^"]+)"|'([^']+)'|(\\S+))`).exec(command);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}
/** The Working Record files a tool call would write, resolved to absolute paths. */
export function recordTargets(toolName, input, cwd, attached) {
  const absolute = (path, base = cwd) => (isAbsolute(path) ? resolve(path) : resolve(base, path));
  const isTarget = (path) => isRecordPath(path) || attached.includes(path);
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
  if (toolName === "bash" && typeof input?.command === "string" && MUTATING.test(input.command)) {
    const record = option(input.command, "--record");
    if (!record) return [];
    const root = option(input.command, "--root");
    return [absolute(record, root ? absolute(root) : cwd)];
  }
  return [];
}
export class TaskMemory {
  host;
  current = { attached: [], held: [] };
  /** This branch's task entries, in order; a write adds one and folds again. */
  entries = [];
  names = new Map();
  /** Registered records' IDs by path, for the Runtime State. */
  ids = new Map();
  lib;
  registry;
  constructor(host) {
    this.host = host;
    this.registry = host.registry ?? new Registry(host.packageRoot);
  }
  state() {
    return this.current;
  }
  /** Rebuild from the branch. Returns whether the state changed. */
  rebuild(branch) {
    this.entries = (branch ?? []).filter((entry) => entry?.type === "custom" && entry.customType === TASK_ENTRY);
    const next = foldState(this.entries);
    const changed = !sameState(this.current, next);
    this.current = next;
    return changed;
  }
  /** Learn the attached records' names and IDs, for the Runtime State. */
  async load() {
    for (const record of this.current.attached) {
      await this.read(record);
      const found = await this.registered(record);
      if (found) this.ids.set(record, found.id);
    }
  }
  write(op, record) {
    const data = { op, record, at: new Date().toISOString() };
    this.host.append(data);
    this.entries.push({ type: "custom", customType: TASK_ENTRY, data });
    this.current = foldState(this.entries);
  }
  script() {
    return join(this.host.packageRoot, "skills", "track-work", "scripts", "working-record.mjs");
  }
  async views() {
    this.lib ??= import(pathToFileURL(join(this.host.packageRoot, "skills/track-work/scripts/lib/views.mjs")).href);
    return this.lib;
  }
  name(record) {
    return this.names.get(record) ?? basename(dirname(record));
  }
  label(record) {
    const id = this.ids.get(record);
    return id ? `${this.name(record)} [${id}]` : this.name(record);
  }
  async read(record) {
    try {
      const text = await readFile(record, "utf8");
      const heading = /^# Working Record:\s*(.+?)\s*$/m.exec(text);
      if (heading) this.names.set(record, heading[1]);
      return { text };
    } catch (error) {
      return { error: error?.code === "ENOENT" ? "the file does not exist" : String(error?.message ?? error) };
    }
  }
  /** The registry entry for a record path, or undefined when unregistered or the registry is unreadable. */
  async registered(record) {
    try {
      return await this.registry.byRecord(record);
    } catch {
      return undefined;
    }
  }
  /** The focused record's resume view, labelled as a snapshot, with its parent or children for a registered task. */
  async snapshot(record) {
    const { text, error } = await this.read(record);
    const found = await this.registered(record);
    if (found) this.ids.set(record, found.id);
    const head = `[Freeflow task memory] Focused task: ${this.label(record)} (${record}), read ${new Date().toISOString()}.`;
    if (error) return `${head}\nThe record is unavailable: ${error}. Nothing was substituted for it.`;
    let resume;
    try {
      resume = (await this.views()).renderResume(text);
    } catch (failure) {
      return `${head}\nThe record cannot be read as a Schema 4 resume view (${failure?.message ?? failure}). Read it with \`node ${this.script()} view full --record ${record}\` and do not edit it.`;
    }
    const fetch = found
      ? `freeflow_task view with the record's ID and an entry ID`
      : `\`node ${this.script()} view entry <ID> --record ${record}\``;
    return [
      head,
      `This is the record's resume view: its present state and an index of closed History. It is Track Work's recovery read for this record, so do not read it again; read a closed entry with ${fetch}. It is a copy at this time; after the record changes, read it again through Track Work.`,
      ...(found ? await this.family(found.id, found.task) : []),
      "",
      resume.trimEnd(),
    ].join("\n");
  }
  /** A child's Parent block, or a parent's Children block: one line per record, read from the records. */
  async family(id, task) {
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
    const lines = ["", "Children (each written by its own session; read one with freeflow_task view):"];
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
  /** A record named by task ID, path, or task directory. */
  async locate(record, cwd) {
    if (typeof record !== "string" || !record.trim()) return { error: "Name the task's ID or its record.md." };
    const name = record.trim();
    if (TASK_ID.test(name)) {
      let task;
      try {
        task = await this.registry.task(name);
      } catch (error) {
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
    await this.read(path);
    const found = await this.registered(path);
    if (found) this.ids.set(path, found.id);
    return { path, id: found?.id };
  }
  /** Take ownership of a registered record, asking the user before taking it from another session. */
  async own(id, takeover) {
    try {
      const result = await this.registry.own(id, this.host.owner(), takeover);
      if (result.owned === true) return undefined;
      const { by } = result;
      const yes = await this.host.confirm(
        `Take over ${id}?`,
        `${id} is owned by session ${by.session}${by.file ? ` (${by.file})` : ""} since ${by.since}. Take it over? That session's writes to it will then be refused.`,
      );
      if (!yes) return `${id} is owned by session ${by.session}; it was not taken over, so it is not attached.`;
      await this.registry.own(id, this.host.owner(), true);
      return undefined;
    } catch (error) {
      return error instanceof RegistryError ? error.message : String(error?.message ?? error);
    }
  }
  async attach(record, cwd) {
    if (this.host.routingAutomatic())
      return { ok: false, text: "Task memory does not attach records under automatic Cognitive Routing yet." };
    const { path, id, error } = await this.locate(record, cwd);
    if (!path) return { ok: false, text: error };
    if (id) {
      const refused = await this.own(id, false);
      if (refused) return { ok: false, text: refused };
    }
    this.write("attach", path);
    return { ok: true, text: await this.snapshot(path), snapshot: path };
  }
  async attachedMatch(record, cwd) {
    if (typeof record !== "string") return undefined;
    const direct = resolve(cwd, record);
    const match = this.current.attached.find((item) => item === direct || item === join(direct, "record.md"));
    if (match) return match;
    if (TASK_ID.test(record.trim())) {
      const { path } = await this.locate(record, cwd);
      return path && this.current.attached.includes(path) ? path : undefined;
    }
    return undefined;
  }
  async focus(record, cwd) {
    const match = await this.attachedMatch(record, cwd);
    if (!match) return { ok: false, text: `${record} is not attached. ${this.attachedText()}` };
    if (this.current.focus !== match) this.write("focus", match);
    return { ok: true, text: await this.snapshot(match), snapshot: match };
  }
  async detach(record, cwd) {
    const match = await this.attachedMatch(record, cwd);
    if (!match) return { ok: false, text: `${record} is not attached. ${this.attachedText()}` };
    this.write("detach", match);
    const id = this.ids.get(match);
    if (id) await this.registry.release(id, this.host.owner().session).catch(() => {});
    return { ok: true, text: `Detached ${this.label(match)} (${match}). ${this.attachedText()}` };
  }
  /** Release held records, one or all, taking ownership of registered ones: the user's command is the confirmation. */
  async confirm(record, cwd) {
    const path = typeof record === "string" && record.trim() ? await this.attachedMatch(record, cwd) : undefined;
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
  holdInherited() {
    const inherited = this.current.attached.filter((item) => !this.current.held.includes(item));
    for (const item of inherited) this.write("hold", item);
    return inherited;
  }
  /** Create a task in this repository's project. It is not attached; the agent proposes that next. */
  async create(title, goal, cwd) {
    if (typeof title !== "string" || !title.trim()) return { ok: false, text: "Give the task a title." };
    try {
      const project = await this.registry.projectFor(cwd);
      if (!project)
        return {
          ok: false,
          text: "This repository is not linked to a project. The user creates one with /freeflow project new <name>.",
        };
      const created = await this.registry.createTask(project.slug, title.trim(), String(goal || title).trim());
      return {
        ok: true,
        text: `Created ${created.id} (${created.record}). It is not attached; propose attaching it with freeflow_task.`,
      };
    } catch (error) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }
  /** Create a child of a registered task. From the model, the parent is the focus and this session must own it. */
  async child(title, goal, parent) {
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
        text: `Created child ${created.id} of ${parentId} (${created.record}). The user works it in a new session with /freeflow task attach ${created.id}. Record the delegation in ${parentId}'s own record through Track Work.`,
      };
    } catch (error) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }
  /** A record's resume view, or one entry, by task ID or path. */
  async view(record, entry, cwd) {
    const { path, error } = await this.locate(record, cwd);
    if (!path) return { ok: false, text: error };
    const { text, error: readError } = await this.read(path);
    if (!text) return { ok: false, text: `${path} is unavailable: ${readError}.` };
    try {
      const views = await this.views();
      return {
        ok: true,
        text:
          typeof entry === "string" && entry.trim()
            ? views.renderEntries(text, [entry.trim()])
            : views.renderResume(text),
      };
    } catch (failure) {
      return { ok: false, text: String(failure?.message ?? failure) };
    }
  }
  /** Records in a search scope: the focus, its task tree, or its project. */
  async scope(scope, cwd) {
    const focus = this.current.focus;
    const found = focus ? await this.registered(focus) : undefined;
    if (scope === "task" || scope === undefined) {
      if (!focus) return { error: "Nothing is in focus." };
      return { records: [[found?.id ?? this.name(focus), focus]] };
    }
    if (scope === "tree") {
      if (!found) return { error: "The focus is not a registered task, so it has no tree." };
      const root = found.task.parent ?? found.id;
      const rootTask = await this.registry.task(root);
      const records = rootTask ? [[root, rootTask.record]] : [];
      for (const child of await this.registry.children(root)) records.push([child.id, child.task.record]);
      return { records };
    }
    if (scope === "project") {
      const slug = found?.task.project ?? (await this.registry.projectFor(cwd))?.slug;
      if (!slug) return { error: "No project: the focus is unregistered and this repository is not linked to one." };
      return { records: (await this.registry.projectTasks(slug)).map(({ id, task }) => [id, task.record]) };
    }
    return { error: "scope must be task, tree or project." };
  }
  /** Lines matching the query in the records of a scope, with the entry each belongs to. Read-only. */
  async search(query, scope, cwd) {
    if (typeof query !== "string" || !query.trim()) return { ok: false, text: "Give a query." };
    let records;
    try {
      const resolved = await this.scope(scope, cwd);
      if (!resolved.records) return { ok: false, text: resolved.error };
      records = resolved.records;
    } catch (error) {
      return { ok: false, text: error?.message ?? String(error) };
    }
    const needle = query.trim().toLowerCase();
    const hits = [];
    for (const [id, record] of records) {
      const { text } = await this.read(record);
      if (!text) continue;
      let heading = "(header)";
      let state = "";
      for (const line of text.split(/\r?\n/)) {
        const entry = /^#{2,4} (.+)$/.exec(line);
        if (entry) {
          heading = entry[1];
          state = "";
          continue;
        }
        const field = /^- State: (\S+)/.exec(line);
        if (field) state = field[1];
        if (line.toLowerCase().includes(needle) && hits.length <= MAX_HITS)
          hits.push(`- ${id} | ${heading}${state ? ` (${state})` : ""} | ${line.trim()}`);
      }
    }
    if (!hits.length) return { ok: true, text: `No match for "${query}" in ${records.length} record(s).` };
    const more = hits.length > MAX_HITS ? `\n(more than ${MAX_HITS} matches; narrow the query or scope)` : "";
    return { ok: true, text: `${hits.slice(0, MAX_HITS).join("\n")}${more}` };
  }
  /** Move an unregistered record into a project's store and register it; the user confirmed before this. */
  async importRecord(record, projectName, cwd) {
    const { path, id, error } = await this.locate(record, cwd);
    if (!path) return { ok: false, text: error };
    if (id) return { ok: false, text: `${path} is already registered as ${id}.` };
    if (typeof projectName !== "string" || !projectName.trim()) return { ok: false, text: "Name the project." };
    try {
      const { slugify } = await import("./registry.js");
      const moved = await this.registry.importRecord(slugify(projectName), path);
      if (this.current.attached.includes(path)) {
        this.write("detach", path);
        this.ids.set(moved.record, moved.id);
        const refused = await this.own(moved.id, false);
        if (!refused) this.write("attach", moved.record);
      }
      return { ok: true, text: `Imported as ${moved.id} (${moved.record}).` };
    } catch (error) {
      return { ok: false, text: error?.message ?? String(error) };
    }
  }
  /** This repository's project tasks and records under .freeflow/tasks, then attached records from elsewhere. */
  async records(cwd) {
    const found = [];
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
    const local = [];
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
  async list(cwd) {
    const records = await this.records(cwd);
    const lines = [];
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
  attachedText() {
    if (!this.current.attached.length) return "No task record is attached.";
    return `Attached: ${this.current.attached.map((item) => this.label(item)).join(", ")}.`;
  }
  /** Lines for the Runtime State, or undefined when task memory is off. */
  runtimeLines() {
    if (!this.host.effective()) return undefined;
    const { attached, held, focus } = this.current;
    if (!attached.length)
      return [
        "Task Memory:",
        "- Attached: none. Propose attaching a record with freeflow_task only when Track Work calls for one.",
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
  async gate(toolName, input, cwd) {
    if (!this.host.effective()) return undefined;
    for (const target of recordTargets(toolName, input, cwd, this.current.attached)) {
      if (!this.current.attached.includes(target))
        return {
          block: true,
          reason: `Task memory: ${target} is not attached to this session, so it cannot be written. ${this.attachedText()} Propose attaching it with freeflow_task, or ask the user; do not write it another way.`,
        };
      if (this.current.held.includes(target))
        return {
          block: true,
          reason: `Task memory: ${target} was inherited by a fork or clone and is held. Only the user releases it, with /freeflow task confirm; do not write it another way.`,
        };
      let found;
      try {
        found = await this.registry.byRecord(target);
      } catch (error) {
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
  delivered(branch, record) {
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
            entry.message.toolName === "freeflow_task" &&
            entry.message.details?.snapshot === record),
      );
  }
  /** Deliver the focus's snapshot as a message unless the branch already has one since the latest compaction. */
  async deliver(branch) {
    const focus = this.current.focus;
    if (!this.host.effective() || !focus || this.delivered(branch, focus)) return;
    this.host.send(await this.snapshot(focus), focus);
  }
  /** The snapshot as a boundary entry, for Freeflow compaction's turn end. */
  async snapshotEntry() {
    const focus = this.current.focus;
    if (!this.host.effective() || !focus) return undefined;
    return {
      type: "custom_message",
      customType: SNAPSHOT_TYPE,
      content: await this.snapshot(focus),
      display: false,
      details: { record: focus },
    };
  }
}
