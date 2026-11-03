// The gate state (SPEC-008, section 4.1): `<FREEFLOW_HOME>/sessions/<session>/gates.json`, the few facts the gates need
// (the held task, its open agreement and Slice, an exact-spec declaration, the open delegations' write scopes), so a
// driver reads one small file instead of a record. Only Track Work's commands write it: those that change what it
// holds (task take, release, switch, create and here's take-back; agreement open and close; slice start, start-direct,
// pause, resume and close; delegate open and close; agree), each write whole, through a temporary file and a rename.
// Each write is derived again from the record, so a lifecycle change made by hand is set right by the next command.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { GATE_STATE_VERSION, normalPath, resolvePath, validGateState } from "./gates5.mjs";
import { fieldText, parseRecord5 } from "./record5.mjs";
import { heldTask } from "./projects5.mjs";
import { isFreeflowStore, storeOf } from "./store.mjs";

export const GATES_FILE = "gates.json";

export function gatesPath(home, sessionId) {
  return join(home, "sessions", sessionId, GATES_FILE);
}

/** This session's gate state, or null when there is none or it cannot be read as version 1. */
export function readGateState(home, sessionId) {
  try {
    const state = JSON.parse(readFileSync(gatesPath(home, sessionId), "utf8"));
    return validGateState(state) ? state : null;
  } catch {
    return null;
  }
}

/** Writes the state whole: a temporary file beside it, then a rename, so a driver never reads half of one. */
export async function writeGateState(home, sessionId, state) {
  const path = gatesPath(home, sessionId);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, path);
  return path;
}

const MAY_WRITE = /^May write: (`[^`]+`(?:,\s*`[^`]+`)*)\s*\.?\s*$/;

/** The globs a brief's Scope names on its `May write:` line, as `delegate open --writes` writes it; null when none. */
export function mayWrite(scopeLines = []) {
  for (const line of scopeLines) {
    const match = MAY_WRITE.exec(line.trim());
    if (match) return [...match[1].matchAll(/`([^`]+)`/g)].map((each) => each[1]);
  }
  return null;
}

/** The brief's header lines and Scope section, read without the delegation module's checks. */
function readBrief(path) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const space = lines.find((line) => line.startsWith("Space: ")) ?? "";
  const worktree = /^Space: .+ worktree (.+) at [0-9a-f]{7,40}, branch \S+$/.exec(space)?.[1] ?? null;
  const handle = /Handle: ([^·]+?)\s*(?:·|$)/.exec(lines.find((line) => line.includes("Handle: ")) ?? "")?.[1] ?? null;
  const start = lines.findIndex((line) => /^## Scope\s*$/.test(line));
  const end = start === -1 ? -1 : lines.findIndex((line, index) => index > start && line.startsWith("## "));
  const scope = start === -1 ? [] : lines.slice(start + 1, end === -1 ? lines.length : end);
  return { worktree, handle: handle && handle !== "not started" ? handle : null, scope };
}

/**
 * One delegation's scope for the gates: its `May write:` globs, resolved against its worktree, else the worktree when
 * one was made, else nothing (a reader); and its own folder, where its progress.md and return.md go.
 */
export function delegationScope(folder) {
  const brief = readBrief(join(folder, "brief.md"));
  const globs = mayWrite(brief.scope);
  const writes = globs
    ? globs.map((glob) => (isAbsolute(glob) ? normalPath(glob) : resolvePath(brief.worktree, glob)))
    : brief.worktree
      ? [`${normalPath(brief.worktree)}/**`]
      : [];
  return { writes, worktree: brief.worktree, folder: normalPath(folder), handle: brief.handle };
}

/** The open delegations of a task folder, with their sub-workers': every one its record's Delegations lists. */
function openDelegations(taskDir, record) {
  const root = join(taskDir, "delegations");
  if (!existsSync(root)) return {};
  const listed = new Set(record.work.delegations.map((item) => item.text.split(" ")[0]));
  const scopes = {};
  for (const name of readdirSync(root)) {
    const id = /^(D-\d{3,})-/.exec(name)?.[1];
    if (!id || !listed.has(id)) continue;
    const folder = join(root, name);
    try {
      scopes[id] = delegationScope(folder);
      for (const sub of readdirSync(folder)) {
        const subId = new RegExp(`^(${id}\\.\\d+)-`).exec(sub)?.[1];
        if (subId && existsSync(join(folder, sub, "brief.md"))) scopes[subId] = delegationScope(join(folder, sub));
      }
    } catch {
      // A folder without a readable brief has no scope the gates can read.
    }
  }
  return scopes;
}

/** A store task's ID from its folder, or the folder's name for a task kept in a repository. */
function taskIdOf(taskDir) {
  const store = storeOf(join(taskDir, "record.md"));
  const number = /^task-\d{3,}/.exec(basename(taskDir))?.[0];
  if (!store || !number) return basename(taskDir);
  const project = /[\\/]projects[\\/]([^\\/]+)[\\/]tasks[\\/][^\\/]+$/.exec(taskDir)?.[1];
  return project ? `${project}/${number}` : number;
}

/**
 * The state for this session now: the task it holds in the store, or else the task whose record the command named,
 * with that record's open agreement, Slice and delegations; without a task, the agreement `agree` recorded. An
 * exact-spec declaration lasts the session.
 * @param {{ home: string, identity: { id: string, short: string }, recordPath?: string | null, agreed?: object | null }} options
 */
export function gateState({ home, identity, recordPath = null, agreed = null }) {
  const previous = readGateState(home, identity.id);
  const held = isFreeflowStore(home) ? heldTask(home, identity) : null;
  const named = recordPath && !held && !storeOf(recordPath) ? resolve(recordPath) : null;
  const taskDir = held?.dir ?? (named ? dirname(named) : null);
  let record = null;
  if (taskDir) {
    try {
      record = parseRecord5(readFileSync(join(taskDir, "record.md"), "utf8"));
    } catch {
      record = null;
    }
  }
  const session = agreed
    ? { outcome: agreed.outcome, at: agreed.at }
    : !previous?.task
      ? (previous?.session ?? null)
      : null;
  const slice = record?.work.slice;
  return {
    v: GATE_STATE_VERSION,
    task: taskDir ? (held?.id ?? taskIdOf(taskDir)) : null,
    taskDir: taskDir ? normalPath(taskDir) : null,
    store: isFreeflowStore(home) ? normalPath(resolve(home)) : null,
    agreement: taskDir ? (record?.work.agreement?.id ?? null) : session ? "session" : null,
    session: taskDir ? null : session,
    exactSpec: agreed?.exactSpec ?? previous?.exactSpec ?? null,
    slice: slice ? { id: slice.id, state: fieldText(slice, "State") } : null,
    delegations:
      taskDir && record ? openDelegations(taskDir, record) : previous?.task ? {} : (previous?.delegations ?? {}),
    updated: new Date().toISOString(),
  };
}

/**
 * Writes this session's gate state after a command that changed what it holds; never fails that command. Returns the
 * path written, or null where there is no session ID or the write failed.
 */
export async function refreshGates({ home, identity, recordPath = null, agreed = null, extra = null }) {
  if (!identity) return null;
  try {
    const state = gateState({ home, identity, recordPath, agreed });
    if (extra && !state.task) state.delegations = { ...state.delegations, ...extra };
    return await writeGateState(home, identity.id, state);
  } catch {
    return null;
  }
}

/** What the state says that the record does not, for validate (section 5), or an empty list. */
export function gateDrift(state, record, recordPath) {
  if (!state || !state.taskDir || normalPath(dirname(resolve(recordPath))) !== state.taskDir) return [];
  const notes = [];
  const agreement = record.work.agreement?.id ?? null;
  if ((state.agreement ?? null) !== agreement)
    notes.push(`agreement ${state.agreement ?? "none"} in gates.json, ${agreement ?? "none"} in the record`);
  const slice = record.work.slice ? `${record.work.slice.id} ${fieldText(record.work.slice, "State")}` : "none";
  const kept = state.slice ? `${state.slice.id} ${state.slice.state ?? ""}`.trim() : "none";
  if (slice !== kept) notes.push(`Slice ${kept} in gates.json, ${slice} in the record`);
  return notes;
}
