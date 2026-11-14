// A task folder's structure (the Spec's section 5, as D-056 settled it): the README the script writes and keeps, which
// lists what each folder and file holds, and `task tidy`, which moves a task's discussion files from sources/ into
// discussions/ unchanged and rewrites the Recovery lines that named them. The folders are made when first written,
// except discussions/, which `task create` makes with the README.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DISCUSSIONS_DIR } from "./discussion5.mjs";
import { parseRecord5 } from "./record5.mjs";

export const README_FILE = "README.md";

/** Each folder a task may hold, and what it holds: one line each, in the README's order. */
export const FOLDERS = [
  [DISCUSSIONS_DIR, "the user's messages, word for word, by day, numbered M-n; kept by Freeflow, read with discussion"],
  ["sources", "outside material only: papers and copies of external documents"],
  ["delegations", "one folder per delegation: its brief, progress and return"],
  ["reviews", "one folder per thing reviewed: its brief and report together"],
  ["notes", "the agent's working lists"],
  ["evidence", "what belongs to no delegation: measurements, logs and captures"],
  ["specs", "accepted specifications"],
  ["plans", "plans the work follows"],
  ["scratch", "temporary work; never synced to the store"],
];

/** The files every task holds, and what each holds. */
export const FILES = [
  ["record.md", "the state: Current Context, Current Work and Future Work"],
  ["history.md", "one entry per closed Slice, agreement or delegation"],
  ["decisions.md", "the open agreement's decision list"],
  ["sessions.md", "the sessions that held this task; the last open line is the hold"],
];

/** The README's text: the task's name, its files, and each folder that exists now, one line each. */
export function renderReadme(taskDir, name) {
  const files = FILES.filter(([file]) => existsSync(join(taskDir, file))).map(
    ([file, what]) => `- \`${file}\`: ${what}`,
  );
  const folders = FOLDERS.filter(([folder]) => existsSync(join(taskDir, folder))).map(
    ([folder, what]) => `- \`${folder}/\`: ${what}`,
  );
  return [
    `# ${name}`,
    "",
    "What this folder holds, one line each. Track Work's script writes and keeps this file: it is rewritten at a checkpoint, at task create and at task tidy, and the folders listed here are the ones that exist now.",
    "",
    "## Files",
    "",
    ...files,
    "",
    "## Folders",
    "",
    ...(folders.length ? folders : ["None yet."]),
    "",
  ].join("\n");
}

/** Writes the README when its text changed; returns whether it did. */
export function writeReadme(taskDir, name) {
  const text = renderReadme(taskDir, name);
  const path = join(taskDir, README_FILE);
  if (existsSync(path) && readFileSync(path, "utf8") === text) return false;
  writeFileSync(path, text);
  return true;
}

/** `task create`'s part: the folder that always exists, discussions/, and the README. */
export function makeTaskFolders(taskDir, name) {
  mkdirSync(join(taskDir, DISCUSSIONS_DIR), { recursive: true });
  writeReadme(taskDir, name);
}

// A Recovery line names a file as a path in backticks, or bare, followed by a space, a closing mark or the line's end,
// or by a line range.
const pointerAt = (name) =>
  new RegExp(
    `(^|[\\s\`(\\[])sources/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s\`)\\],;:]|\\s*\\(lines?\\s)`,
    "g",
  );

/** The record's text with the Recovery lines that name a moved file pointed at its new place: { text, rewritten }. */
export function rewriteRecovery(recordText, moved) {
  const lines = recordText.split("\n");
  const start = lines.findIndex((line) => /^#{2,3} Recovery\s*$/.test(line));
  if (start < 0) return { text: recordText, rewritten: 0 };
  let end = lines.findIndex((line, index) => index > start && /^#{1,3} /.test(line));
  if (end < 0) end = lines.length;
  let rewritten = 0;
  for (let index = start + 1; index < end; index += 1) {
    let line = lines[index];
    for (const name of moved) {
      const next = line.replace(pointerAt(name), (_match, lead) => `${lead}${DISCUSSIONS_DIR}/${name}`);
      if (next !== line) {
        line = next;
        rewritten += 1;
      }
    }
    lines[index] = line;
  }
  return { text: lines.join("\n"), rewritten };
}

/**
 * `task tidy`, planned: which sources/discussion*.md files move into discussions/ unchanged, and the record text whose
 * Recovery lines name their new place (null when none did). It writes nothing; refuses to overwrite a file in
 * discussions/. History and everything else stay as they are.
 */
export function planTidy(taskDir, recordText) {
  const sources = join(taskDir, "sources");
  const moved = existsSync(sources)
    ? readdirSync(sources)
        .filter((file) => /^discussion.*\.md$/.test(file))
        .sort()
    : [];
  const clashes = moved.filter((file) => existsSync(join(taskDir, DISCUSSIONS_DIR, file)));
  if (clashes.length)
    throw new Error(
      `discussions/${clashes.join(", discussions/")} already exists: move or rename the sources/ copy by hand, then tidy again.`,
    );
  const { text, rewritten } = rewriteRecovery(recordText, moved);
  return { moved, rewritten, recordText: text === recordText ? null : text };
}

/**
 * `task tidy`, applied after its record is written: the moves, then the README. A sources/ folder the moves leave empty
 * is removed, since folders are made when first written. Returns whether the README changed.
 */
export function applyTidy(taskDir, plan) {
  if (plan.moved.length) mkdirSync(join(taskDir, DISCUSSIONS_DIR), { recursive: true });
  for (const file of plan.moved) renameSync(join(taskDir, "sources", file), join(taskDir, DISCUSSIONS_DIR, file));
  const sources = join(taskDir, "sources");
  if (plan.moved.length && existsSync(sources) && readdirSync(sources).length === 0) rmdirSync(sources);
}

/** The record text a tidy writes must still parse as Schema 5. */
export function checkTidyRecord(recordText) {
  parseRecord5(recordText);
}
