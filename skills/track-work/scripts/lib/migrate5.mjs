// migrate: a Schema 4 record to Schema 5 (the Spec's section 14). Current Context maps to Goal, Settled and Open; the
// Work agreement and Boundaries become the open agreement; What defines this task, and Recovery sources that point to a
// skill, become Defined by, read whole and not counted; the other Recovery sources become Read on recovery and Read
// when; closed Slices become history.md entries, with the cues given or marked missing; active
// Decisions become Settled lines; the decision list goes to decisions.md when an agreement is open. Nothing is lost:
// the Schema 4 record is kept whole as sources/schema4-record.md, and Notes move to sources/notes.md.

import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { fieldLines, fieldValue, parseDocument } from "./document.mjs";
import { slugify } from "./format.mjs";
import { syncStore } from "./freeflow-store.mjs";
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
  const readWhen = sources
    .filter((line) => /\bread (?:only )?(?:when|if)\b/i.test(line))
    .map((line) => `- ${rewrite(line)}`);
  // A source that points to a skill is method, not memory: Defined by, with the task's defining artifacts (P61).
  const always = sources.filter((line) => !/\bread (?:only )?(?:when|if)\b/i.test(line));
  const skill = (line) => /(?:^|[\s`(])\S*skills\/[^/\s]+\/(?:SKILL\.md|references\/\S+)/.test(line);
  const definedBy = [
    ...items(contextLines(document, "What defines this task")).map((line) => `- ${rewrite(line)}`),
    ...always.filter(skill).map((line) => `- ${rewrite(line)}`),
  ];
  const readNow = always.filter((line) => !skill(line)).map((line) => `- ${rewrite(line)}`);
  const notes = trim(document.lines.slice(document.sections.Notes.start));
  readWhen.push(
    `- ${ARCHIVE} — the Schema 4 record as it was before migrate, with every Decision, Checkpoint and closed Slice in full; read when an earlier decision, checkpoint or Slice is in question`,
  );
  if (notes.length)
    readWhen.push("- sources/notes.md — the record's Notes, moved at migrate; read when they bear on the work");
  const nextAction = items(document.lines.slice(document.current.nextAction.start, document.current.nextAction.end));
  let record = skeleton5({
    name,
    cue,
    stateAsOf: new Date().toISOString(),
    sections: {
      Goal: bullets(contextLines(document, "Goal")),
      Settled: settled,
      Open: open,
      "Defined by": definedBy,
      "Read on recovery": readNow,
      "Read when": readWhen,
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
  if (project) {
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
    taskDir = target;
  }
  if (existsSync(join(taskDir, HISTORY_FILE)))
    fail(`${join(taskDir, HISTORY_FILE)} exists: this task looks migrated already`);
  await mkdir(join(taskDir, "sources"), { recursive: true });
  await writeFile(join(taskDir, ARCHIVE), text);
  if (result.notes) {
    const notesPath = join(taskDir, "sources", "notes.md");
    const before = existsSync(notesPath) ? `${(await readFile(notesPath, "utf8")).trimEnd()}\n\n` : "";
    await writeFile(notesPath, `${before}${result.notes}`);
  }
  const list = join(taskDir, "sources", "decisions.md");
  let decisions = existsSync(list) ? "left in sources/decisions.md" : "not there: the task kept none";
  if (result.agreementOpen && existsSync(list)) {
    const content = await readFile(list, "utf8");
    await writeFile(join(taskDir, DECISIONS_FILE), /^#/.test(content) ? content : `${EMPTY_DECISIONS}\n${content}`);
    await rename(list, join(taskDir, "sources", "decisions-before-schema5.md"));
    decisions = "moved to decisions.md, the open agreement's list";
  } else if (!existsSync(join(taskDir, DECISIONS_FILE)))
    await writeFile(join(taskDir, DECISIONS_FILE), EMPTY_DECISIONS);
  await writeFile(join(taskDir, HISTORY_FILE), result.history);
  await writeFile(join(taskDir, "record.md"), result.record);
  const warnings = warnings5({ record: parseRecord5(result.record), history: parseHistory5(result.history) }).filter(
    (warning) => !warning.includes("no cue was given"),
  );
  let synced = "";
  if (project) {
    try {
      const outcome = await syncStore({ home, message: `Migrate ${basename(taskDir)} to Schema 5` });
      synced = outcome.local
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
