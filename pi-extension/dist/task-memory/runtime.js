import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
/**
 * Task memory: which Working Records a session works on. The user attaches records (the model may propose one); one
 * attached record is the focus. State is a fold over branch entries, so it follows /tree navigation and is copied on
 * fork; it is rebuilt at session start and navigation and otherwise kept in memory. Records stay where Track Work keeps
 * them and are read through Track Work's own library, so a record stays valid for the script skill on other hosts.
 */
export const TASK_ENTRY = "freeflow-task-memory-v1";
export const SNAPSHOT_TYPE = "freeflow-task-memory-snapshot";
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
  lib;
  constructor(host) {
    this.host = host;
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
  /** The focused record's resume view, labelled as a snapshot. */
  async snapshot(record) {
    const { text, error } = await this.read(record);
    const head = `[Freeflow task memory] Focused task: ${this.name(record)} (${record}), read ${new Date().toISOString()}.`;
    if (error) return `${head}\nThe record is unavailable: ${error}. Nothing was substituted for it.`;
    let resume;
    try {
      resume = (await this.views()).renderResume(text);
    } catch (failure) {
      return `${head}\nThe record cannot be read as a Schema 4 resume view (${failure?.message ?? failure}). Read it with \`node ${this.script()} view full --record ${record}\` and do not edit it.`;
    }
    return [
      head,
      `This is the record's resume view: its present state and an index of closed History. It is Track Work's recovery read for this record, so do not read it again; read a closed entry with \`node ${this.script()} view entry <ID> --record ${record}\`. It is a copy at this time; after the record changes, read it again through Track Work.`,
      "",
      resume.trimEnd(),
    ].join("\n");
  }
  async resolveRecord(record, cwd) {
    if (typeof record !== "string" || !record.trim()) return { error: "Name the task's record.md." };
    let path = isAbsolute(record) ? resolve(record) : resolve(cwd, record.trim());
    try {
      if ((await stat(path)).isDirectory()) path = join(path, "record.md");
      if (!(await stat(path)).isFile()) return { error: `${path} is not a file.` };
    } catch {
      return { error: `${path} does not exist.` };
    }
    if (basename(path) !== "record.md") return { error: `${path} is not a Working Record (record.md).` };
    await this.read(path);
    return { path };
  }
  async attach(record, cwd) {
    if (this.host.routingAutomatic())
      return { ok: false, text: "Task memory does not attach records under automatic Cognitive Routing yet." };
    const { path, error } = await this.resolveRecord(record, cwd);
    if (!path) return { ok: false, text: error };
    this.write("attach", path);
    return { ok: true, text: await this.snapshot(path), snapshot: path };
  }
  async focus(record, cwd) {
    const path = typeof record === "string" ? resolve(cwd, record) : "";
    const match = this.current.attached.find((item) => item === path || item === join(path, "record.md"));
    if (!match) return { ok: false, text: `${record} is not attached. ${this.attachedText()}` };
    if (this.current.focus !== match) this.write("focus", match);
    return { ok: true, text: await this.snapshot(match), snapshot: match };
  }
  detach(record, cwd) {
    const path = typeof record === "string" ? resolve(cwd, record) : "";
    const match = this.current.attached.find((item) => item === path || item === join(path, "record.md"));
    if (!match) return { ok: false, text: `${record} is not attached. ${this.attachedText()}` };
    this.write("detach", match);
    return { ok: true, text: `Detached ${this.name(match)} (${match}). ${this.attachedText()}` };
  }
  /** Release held records: one, or all when none is named. */
  confirm(record, cwd) {
    const path = typeof record === "string" && record.trim() ? resolve(cwd, record.trim()) : undefined;
    const targets = this.current.held.filter((item) => !path || item === path || item === join(path, "record.md"));
    if (!targets.length) return { ok: false, text: "No held record matches." };
    for (const item of targets) this.write("confirm", item);
    return { ok: true, text: `Writable again: ${targets.map((item) => this.name(item)).join(", ")}.` };
  }
  /** After a fork or clone: inherited records stay listed and readable but not writable until confirmed. */
  holdInherited() {
    const inherited = this.current.attached.filter((item) => !this.current.held.includes(item));
    for (const item of inherited) this.write("hold", item);
    return inherited;
  }
  /** This repository's records under .freeflow/tasks, then attached records from elsewhere. */
  async records(cwd) {
    const found = [];
    try {
      for (const entry of await readdir(join(cwd, ".freeflow", "tasks"), { withFileTypes: true })) {
        const record = join(cwd, ".freeflow", "tasks", entry.name, "record.md");
        if (entry.isDirectory() && (await this.read(record)).text !== undefined) found.push(record);
      }
    } catch {
      // No tasks directory: only attached records are listed.
    }
    return [...new Set([...found.sort(), ...this.current.attached])];
  }
  async list(cwd) {
    const records = await this.records(cwd);
    const lines = [];
    for (const record of records) {
      const { text } = await this.read(record);
      if (text === undefined && !this.current.attached.includes(record)) continue;
      const state = text ? (/^State:\s*(\S+)/m.exec(text)?.[1] ?? "unknown") : "unavailable";
      const role =
        this.current.focus === record
          ? ", focus"
          : this.current.held.includes(record)
            ? ", attached (held)"
            : this.current.attached.includes(record)
              ? ", attached"
              : "";
      lines.push(`- ${this.name(record)} — ${record} (${state}${role})`);
    }
    return lines.length ? lines.join("\n") : "No Working Records found under .freeflow/tasks and none attached.";
  }
  attachedText() {
    if (!this.current.attached.length) return "No task record is attached.";
    return `Attached: ${this.current.attached.map((item) => this.name(item)).join(", ")}.`;
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
          `- ${item === focus ? "Focus" : "Attached"}: ${this.name(item)} (\`${item}\`)${held.includes(item) ? ", held: not writable until the user confirms" : ""}`,
      ),
      ...(focus ? [] : ["- Focus: none"]),
    ];
  }
  /** A refusal for a tool call that would write a record this session has not attached. */
  gate(toolName, input, cwd) {
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
