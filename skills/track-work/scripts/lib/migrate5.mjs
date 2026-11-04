// migrate: a Schema 4 record to Schema 5 (the Spec's section 14). Current Context maps to Goal, Settled and Open; the
// Work agreement and Boundaries become the open agreement; What defines this task, and Recovery sources that point to a
// skill, become Recovery lines read always and not counted; the other Recovery sources become always lines, or when
// lines where they say when to read them; closed Slices become history.md entries, with the cues given or marked
// missing; active
// Decisions become Settled lines; the decision list goes to decisions.md when an agreement is open. Nothing is lost:
// the Schema 4 record is kept whole as sources/schema4-record.md, and Notes move to sources/notes.md.

import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { fieldLines, fieldValue, parseDocument } from "./document.mjs";
import { slugify } from "./format.mjs";
import { HOST_COMMITS_TEXT, syncStore } from "./freeflow-store.mjs";
import {
  DECISIONS_FILE,
  EMPTY_DECISIONS,
  ENTRY_ORDER,
  HISTORY_FILE,
  PROPOSED5_ORDER,
  SLICE5_ORDER,
  UPDATE_KINDS,
  cueProblem,
  emptyHistory,
  parseHistory5,
  parseRecord5,
  renderFields5,
  skeleton5,
  stateLine5,
  warnings5,
} from "./record5.mjs";
import { isFreeflowStore, nextTaskNumber } from "./store.mjs";
import { writeNoFollow } from "./no-follow.mjs";

export const ARCHIVE = "sources/schema4-record.md";
const MISSING_CUE = "read when — no cue was given at migrate; add one as a Correction";

class MigrateError extends Error {
  constructor(message) {
    super(message);
    this.name = "MigrateError";
  }
}

function fail(message) {
  throw new MigrateError(message);
}

function localDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const trim = (lines = []) => {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out.at(-1).trim()) out.pop();
  return out;
};

/** A section's bullets, each with the lines indented under it joined in, so each item is one line. */
function items(lines) {
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s*[-*] /.test(line) && !/^\s{2,}/.test(line)) out.push(line.replace(/^\s*[-*]\s+/, "").trim());
    else if (out.length) out[out.length - 1] += ` ${line.trim().replace(/^[-*]\s+/, "")}`;
    else out.push(line.trim());
  }
  return out;
}

/** A section's lines as Schema 5 keeps free text: as they are, but each non-bullet line made a bullet. */
function bullets(lines) {
  return trim(lines).map((line) =>
    !line.trim() || /^\s*[-*] /.test(line) || /^\s{2,}/.test(line) ? line : `- ${line.trim()}`,
  );
}

const KIND_MAP = new Map([
  ["Evidence", "Evidence (observed)"],
  ["Review gate", "Review"],
  ...[...UPDATE_KINDS].map((kind) => [kind, kind]),
]);

/** A Schema 4 Material update as one Schema 5 update line; a kind Schema 5 does not have is kept as a report. */
function updateLine(text) {
  const match = /^(.+?) — (.*)$/.exec(text);
  const kind = match && KIND_MAP.get(match[1]);
  return kind ? `- ${kind}: ${match[2]}` : `- Evidence (reported): ${text}`;
}

function contextLines(document, heading) {
  const section = document.context.headings.get(heading);
  return section ? trim(document.lines.slice(section.start, section.end)) : [];
}

/** The Schema 5 files for a parsed Schema 4 record. `cues` maps a closed Slice's ID to its cue. */
export function convert(text, { cue, cues = {}, taskPrefix = null, today = localDate() }) {
  const problem = cueProblem(cue);
  if (problem) fail(`--cue: ${problem}`);
  const document = parseDocument(text);
  const rewrite = (line) => (taskPrefix ? line.split(taskPrefix).join("") : line);
  const name = document.header.name;
  const decisions = document.history.decisions.blocks;
  const active = decisions.filter((block) => fieldValue(block, "State") === "active");
  const agreement = contextLines(document, "Work agreement");
  const boundaries = items(contextLines(document, "Boundaries"));
  const pending = document.future.items.filter((item) => item.kind === "checkpoint" && item.id);
  const settled = [
    ...bullets(contextLines(document, "Settled")),
    ...active.map(
      (block) =>
        `- ${block.id} — ${block.title}: ${fieldValue(block, "Decision")} (${fieldValue(block, "Established by")})`,
    ),
    ...(agreement.length ? [] : boundaries.map((line) => `- Boundary: ${line}`)),
  ];
  const open = [
    ...bullets(contextLines(document, "Open")),
    ...items(contextLines(document, "Tentative")).map((line) => `- Tentative: ${line}`),
    ...pending.map(
      (item) =>
        `- ${fieldValue(item, "State") === "deferred" ? "Deferred" : "Pending"} Checkpoint ${item.id} — ${item.title} (${fieldValue(item, "Type")}, for ${fieldValue(item, "Applies to")}): ${fieldValue(item, "Condition")}`,
    ),
  ];
  const sources = document.current.recoverySources
    ? items(document.lines.slice(document.current.recoverySources.start, document.current.recoverySources.end))
    : [];
  // Each source becomes a Recovery line (P28): one read only in some situations a when line, its trigger taken from its
  // "read when …"; a definition, or a source that points to a skill (method, not memory), always and not counted; the
  // rest always.
  const conditional = /\bread (?:only )?(?:when|if) ([^.;]+)/i;
  const whenLine = (line) => {
    const trigger = conditional.exec(line)[1].trim();
    const rest = line
      .replace(conditional, "")
      .replace(/[\s;,.]+$/, "")
      .trim();
    return `- when ${trigger}: ${rest}`;
  };
  const readWhen = sources.filter((line) => conditional.test(line)).map((line) => whenLine(rewrite(line)));
  const always = sources.filter((line) => !conditional.test(line));
  const skill = (line) => /(?:^|[\s`(])\S*skills\/[^/\s]+\/(?:SKILL\.md|references\/\S+)/.test(line);
  const uncounted = [
    ...items(contextLines(document, "What defines this task")).map((line) => `- always, not counted: ${rewrite(line)}`),
    ...always.filter(skill).map((line) => `- always, not counted: ${rewrite(line)}`),
  ];
  const readNow = always.filter((line) => !skill(line)).map((line) => `- always: ${rewrite(line)}`);
  const notes = trim(document.lines.slice(document.sections.Notes.start));
  readWhen.push(
    `- when an earlier decision, checkpoint or Slice is in question: ${ARCHIVE} — the Schema 4 record as it was before migrate, with every Decision, Checkpoint and closed Slice in full`,
  );
  if (notes.length)
    readWhen.push("- when the record's Notes bear on the work: sources/notes.md — the Notes, moved at migrate");
  const nextAction = items(document.lines.slice(document.current.nextAction.start, document.current.nextAction.end));
  let record = skeleton5({
    name,
    cue,
    stateAsOf: new Date().toISOString(),
    sections: {
      Goal: bullets(contextLines(document, "Goal")),
      Settled: settled,
      Open: open,
      Recovery: [...uncounted, ...readNow, ...readWhen],
      "Next action": nextAction.length
        ? [`- ${nextAction.join(" ")}`]
        : ["- Recover, then agree the next step with the user."],
    },
  }).replace(stateLine5("active", "normal"), () => stateLine5(document.header.state, "normal"));
  const work = [];
  if (agreement.length) {
    const lines = [...bullets(agreement), ...boundaries.map((line) => `- Boundary: ${line}`)];
    work.push(
      `### Agreement A-001 — The work agreement`,
      "",
      `- Opened: ${today}`,
      ...lines.map((line) => line.replace(/^- (Opened|Update):/, "- $1 (migrated):")),
      "",
    );
  }
  const slice = document.current.currentSlice;
  if (slice) {
    const value = (field) => fieldLines(slice, field);
    const values = {
      State: [fieldValue(slice, "State")],
      Opened: [today],
      Under: value("Authority source"),
      "Result wanted": value("Intended result"),
      Scope: value("Scope"),
      "Done when": value("Expected evidence"),
      "Stop if": value("Stop condition"),
      "Started from": value("Starting state"),
      Dependencies: value("Dependencies"),
    };
    const material = [];
    let inMaterial = false;
    for (const line of document.lines.slice(slice.start + 1, slice.end)) {
      if (/^#####\s+Material updates/.test(line)) inMaterial = true;
      else if (inMaterial) material.push(line);
    }
    const fields = renderFields5(`### Slice ${slice.id} — ${slice.title}`, SLICE5_ORDER, values);
    work.push(fields[0], "", ...fields.slice(1), ...items(material).map((line) => updateLine(rewrite(line))), "");
  }
  // A function replacement, so a "$" in the user's words is kept as written.
  if (work.length) record = record.replace("## Current Work\n\n", () => `## Current Work\n\n${work.join("\n")}\n`);
  const future = document.future.items.filter((item) => item.kind === "slice");
  const direction = items(contextLines(document, "Current direction"));
  const futureBlocks = [
    ...future.map((item) => {
      const block = renderFields5(`### Slice — ${item.title}`, PROPOSED5_ORDER, {
        "Result wanted": fieldLines(item, "Intended result"),
        "Done when": fieldLines(item, "Expected evidence"),
        Dependencies: fieldLines(item, "Dependencies"),
      });
      return [block[0], "", ...block.slice(1), ""];
    }),
    ...(direction.length && !future.some((item) => item.title === "Continue the current direction")
      ? [["### Slice — Continue the current direction", "", `- Result wanted: ${direction.join(" ")}`, ""]]
      : []),
  ].flat();
  if (futureBlocks.length) record = `${record.trimEnd()}\n\n${futureBlocks.join("\n").trimEnd()}\n`;
  parseRecord5(record);

  const entries = document.history.slices.blocks.map((block) => {
    const corrections = [];
    let inCorrections = false;
    for (const line of document.lines.slice(block.start + 1, block.end)) {
      if (/^#####\s+Corrections/.test(line)) inCorrections = true;
      else if (inCorrections && line.trim()) corrections.push(line.replace(/^\s*-\s*/, "").trim());
    }
    const taskEffect = [
      ...(fieldLines(block, "Task effect") ?? []),
      ...(fieldLines(block, "Residual effects")
        ? [`Residual effects: ${fieldLines(block, "Residual effects").join(" ")}`]
        : []),
    ];
    const values = {
      State: fieldValue(block, "State"),
      Dates: fieldValue(block, "Occurred") || "not recorded before Schema 5",
      Recorded: fieldValue(block, "Recorded") || null,
      Cue: cues[block.id] ?? MISSING_CUE,
      Under: fieldLines(block, "Authority source") ?? "not recorded before Schema 5",
      "Result wanted": fieldLines(block, "Intended result"),
      Result: fieldLines(block, "Result"),
      Evidence: (fieldLines(block, "Evidence and limits") ?? []).map(rewrite),
      "Task effect": taskEffect,
      "Resume when": fieldLines(block, "Resume when"),
      Reason: fieldLines(block, "Reason"),
    };
    const fields = renderFields5(`## ${block.id} — ${block.title}`, ENTRY_ORDER.slice, values);
    return [fields[0], "", ...fields.slice(1), ...corrections.map((line) => `- Correction: ${line}`), ""];
  });
  const history = `${emptyHistory(name).trimEnd()}\n${entries.length ? `\n${entries.flat().join("\n").trimEnd()}\n` : ""}`;
  parseHistory5(history);
  for (const id of Object.keys(cues))
    if (!document.history.slices.blocks.some((block) => block.id === id))
      fail(`--cues names ${id}, which is not a closed Slice`);
  return {
    record,
    history,
    agreementOpen: agreement.length > 0,
    notes: notes.length ? `${notes.join("\n")}\n` : null,
    missingCues: document.history.slices.blocks.filter((block) => !cues[block.id]).map((block) => block.id),
    kept: { decisions: decisions.length - active.length, checkpoints: document.history.checkpoints.blocks.length },
  };
}

/** Reads a cues file: one "S-NNN: read when …" line per closed Slice. */
export async function readCues(path) {
  if (!path) return {};
  const cues = {};
  for (const line of (await readFile(path, "utf8")).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^(S-\d{3,}):\s*(.+)$/.exec(line.trim());
    if (!match) fail(`A cues line is "S-NNN: read when …": ${line}`);
    const problem = cueProblem(match[2]);
    if (problem) fail(`${match[1]}'s cue: ${problem}`);
    cues[match[1]] = match[2];
  }
  return cues;
}

/** Copies a task folder, scratch/ left behind, into a project of the store as its next task; returns the copy. */
async function copyIntoProject(home, project, taskDir) {
  if (!isFreeflowStore(home)) fail(`${home} is not a Freeflow store; run store init first`);
  const tasks = join(home, "projects", slugify(project), "tasks");
  if (!existsSync(dirname(tasks))) fail(`No project ${slugify(project)} in the store; project new makes one`);
  await mkdir(tasks, { recursive: true });
  const number = String(await nextTaskNumber(tasks)).padStart(3, "0");
  const target = join(tasks, `task-${number}-${basename(taskDir).replace(/^task-\d{3,}-/, "")}`);
  await cp(taskDir, target, {
    recursive: true,
    filter: (source) => basename(source) !== "scratch" || source === taskDir,
  });
  await mkdir(join(target, "scratch"), { recursive: true });
  return target;
}

/**
 * Brings a Schema 5 task kept without a store, in a repository's ignored .freeflow/tasks/, into a project of the store
 * as its next task, unchanged, leaving the original as it was (P91).
 */
export async function copyTaskIntoStore({ recordPath, home, project }) {
  const taskDir = await copyIntoProject(home, project, dirname(recordPath));
  const outcome = await syncStore({ home, message: `Bring ${basename(taskDir)} into the store` });
  const synced = outcome.hostCommits
    ? HOST_COMMITS_TEXT
    : outcome.local
      ? "Store: committed; a local store."
      : outcome.pushed
        ? "Store: committed and pushed."
        : `Store: committed, not pushed (${outcome.reason}).`;
  const id = `${slugify(project)}/${/^task-\d{3,}/.exec(basename(taskDir))[0]}`;
  return `Brought into the store as ${id}: ${join(taskDir, "record.md")}\nThe original folder is unchanged: ${dirname(recordPath)}.\n${synced}\n`;
}

/**
 * Migrates a Schema 4 task folder: in place, or with `project` into that project's folder in the Freeflow store as
 * its next task, leaving the original folder as it was.
 */
export async function migrateTask({ recordPath, text, root, cue, cues, home, project }) {
  let taskDir = dirname(recordPath);
  // Pointers written from the repository root to this task's folder become relative to the folder.
  const fromRoot = root ? relative(root, taskDir) : "";
  const result = convert(text, {
    cue,
    cues,
    taskPrefix: fromRoot && !fromRoot.startsWith("..") ? `${fromRoot}/` : null,
  });
  if (project) taskDir = await copyIntoProject(home, project, taskDir);
  if (existsSync(join(taskDir, HISTORY_FILE)))
    fail(`${join(taskDir, HISTORY_FILE)} exists: this task looks migrated already`);
  await mkdir(join(taskDir, "sources"), { recursive: true });
  await writeNoFollow(join(taskDir, ARCHIVE), text);
  if (result.notes) {
    const notesPath = join(taskDir, "sources", "notes.md");
    const before = existsSync(notesPath) ? `${(await readFile(notesPath, "utf8")).trimEnd()}\n\n` : "";
    await writeNoFollow(notesPath, `${before}${result.notes}`);
  }
  const list = join(taskDir, "sources", "decisions.md");
  let decisions = existsSync(list) ? "left in sources/decisions.md" : "not there: the task kept none";
  if (result.agreementOpen && existsSync(list)) {
    const content = await readFile(list, "utf8");
    await writeNoFollow(join(taskDir, DECISIONS_FILE), /^#/.test(content) ? content : `${EMPTY_DECISIONS}\n${content}`);
    await rename(list, join(taskDir, "sources", "decisions-before-schema5.md"));
    decisions = "moved to decisions.md, the open agreement's list";
  } else if (!existsSync(join(taskDir, DECISIONS_FILE)))
    await writeNoFollow(join(taskDir, DECISIONS_FILE), EMPTY_DECISIONS);
  await writeNoFollow(join(taskDir, HISTORY_FILE), result.history);
  await writeNoFollow(join(taskDir, "record.md"), result.record);
  const warnings = warnings5({ record: parseRecord5(result.record), history: parseHistory5(result.history) }).filter(
    (warning) => !warning.includes("no cue was given"),
  );
  let synced = "";
  if (project) {
    try {
      const outcome = await syncStore({ home, message: `Migrate ${basename(taskDir)} to Schema 5` });
      synced = outcome.hostCommits
        ? HOST_COMMITS_TEXT
        : outcome.local
          ? "Store: committed; a local store."
          : outcome.pushed
            ? "Store: committed and pushed."
            : `Store: committed, not pushed (${outcome.reason}).`;
    } catch (error) {
      synced = `Store not synced: ${error.message}`;
    }
  }
  return [
    `Migrated to Schema 5: ${join(taskDir, "record.md")}`,
    `History: ${parseHistory5(result.history).entries.length} closed Slice(s)${result.missingCues.length ? `; no cue for ${result.missingCues.join(", ")} (each marked missing; add one as a Correction)` : parseHistory5(result.history).entries.length ? "; every cue given" : ""}.`,
    `The Schema 4 record is kept whole in ${ARCHIVE}, with ${result.kept.decisions} superseded or retired Decision(s) and ${result.kept.checkpoints} closed Checkpoint(s) that Schema 5 has no place for. The decision list was ${decisions}.`,
    ...(project ? [`The original folder is unchanged: ${dirname(recordPath)}.`, synced] : []),
    ...warnings.map((warning) => `Warning: ${warning}`),
  ]
    .filter(Boolean)
    .join("\n")
    .concat("\n");
}

// A Schema 5 record written before the one Recovery list (#145) keeps what to read on recovery under three headings,
// Defined by, Read on recovery and Read when, with files to carry as Carry lines in In flight. These become Recovery
// lines: a Defined by entry `always, not counted`, a Read on recovery entry and a Carry file `always`, and a Read when
// entry a `when` line with its trigger. Every other line of the record is kept as it was.
export const OLD_RECOVERY_HEADINGS = ["Defined by", "Read on recovery", "Read when"];

/** Whether a Schema 5 record still has the headings that came before the one Recovery list. */
export function hasOldRecoveryHeadings(text) {
  return OLD_RECOVERY_HEADINGS.some((heading) => new RegExp(`^### ${heading}\\s*$`, "m").test(text));
}

function sectionBody(lines, heading) {
  const start = lines.findIndex((line) => line.trim() === `### ${heading}`);
  if (start === -1) return { start: -1, end: -1, body: [] };
  let end = start + 1;
  while (end < lines.length && !/^#{2,3} /.test(lines[end])) end += 1;
  return { start, end, body: lines.slice(start + 1, end) };
}

/** One Read when entry, `<pointer> — <why>; read when <trigger>`, as `when <trigger>: <pointer> — <why>`. */
function whenLine(entry) {
  const match = /^(.*?)[;,.]?\s+[Rr]ead when (.+?)\.?$/.exec(entry);
  if (!match) return `when its situation applies: ${entry}`;
  return `when ${match[2].trim()}: ${match[1].trim()}`;
}

/**
 * The record with its Recovery list in place of the older headings and Carry lines; `null` when it has none of them.
 * Bullet continuation lines (indented two spaces) stay with their bullet.
 */
export function convertRecoveryHeadings(text) {
  if (!hasOldRecoveryHeadings(text) && !/^- Carry:/m.test(text)) return null;
  let lines = text.split("\n");
  const recovery = [];
  const take = (heading, toLine) => {
    const { start, end, body } = sectionBody(lines, heading);
    if (start === -1) return;
    let current = null;
    for (const line of body) {
      if (line.startsWith("- ")) {
        if (current !== null) recovery.push(toLine(current));
        current = line.slice(2).trim();
      } else if (/^\s{2,}\S/.test(line) && current !== null) current += ` ${line.trim()}`;
    }
    if (current !== null) recovery.push(toLine(current));
    lines = [...lines.slice(0, start), ...lines.slice(end)];
  };
  take("Defined by", (entry) => `always, not counted: ${entry}`);
  take("Read on recovery", (entry) => `always: ${entry}`);
  take("Read when", whenLine);
  // Carry lines leave In flight and become always lines, read fresh at the next recovery.
  lines = lines.filter((line) => {
    const carry = /^- Carry:\s*(.+)$/.exec(line);
    if (!carry) return true;
    if (!/^none\.?$/i.test(carry[1].trim())) recovery.push(`always: ${carry[1].trim()}`);
    return false;
  });
  const next = lines.findIndex((line) => line.trim() === "### Next action");
  if (next === -1) fail("this record has no ### Next action heading to put the Recovery list before");
  const existing = sectionBody(lines, "Recovery");
  if (existing.start !== -1) fail("this record has both a Recovery list and the older headings: merge them by hand");
  const block = ["### Recovery", "", ...(recovery.length ? recovery.map((line) => `- ${line}`) : []), ""];
  lines = [...lines.slice(0, next), ...block, ...lines.slice(next)];
  return { record: lines.join("\n").replace(/\n{3,}/g, "\n\n"), count: recovery.length };
}

/** Converts a task's record.md in place, keeps the old one in sources/, and syncs the store that holds it. */
export async function migrateRecoveryHeadings({ recordPath, text, home }) {
  const converted = convertRecoveryHeadings(text);
  if (!converted) fail("this record already has the one Recovery list: nothing to migrate");
  parseRecord5(converted.record);
  const taskDir = dirname(recordPath);
  await mkdir(join(taskDir, "sources"), { recursive: true });
  const kept = join(taskDir, "sources", "record-before-recovery.md");
  await writeNoFollow(kept, text);
  await writeNoFollow(recordPath, converted.record);
  let synced = "";
  if (home) {
    try {
      const outcome = await syncStore({ home, message: `Migrate ${basename(taskDir)} to the Recovery list` });
      synced = outcome.hostCommits
        ? HOST_COMMITS_TEXT
        : outcome.local
          ? "Store: committed; a local store."
          : outcome.pushed
            ? "Store: committed and pushed."
            : `Store: committed, not pushed (${outcome.reason}).`;
    } catch (error) {
      synced = `Store not synced: ${error.message}`;
    }
  }
  return [
    `Migrated to the Recovery list: ${recordPath}, ${converted.count} line(s).`,
    `The record as it was is kept in sources/record-before-recovery.md. Read the list: a when line's trigger is the old line's "read when" text.`,
    synced,
  ]
    .filter(Boolean)
    .join("\n");
}
