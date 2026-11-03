#!/usr/bin/env node
// The drift audit (SPEC-014, section 2.2): each hunk of the change against a base that no decision item's "Shows at"
// covers, so the account at the end and the reviewer see the choices nobody agreed. A hunk is covered when an item that
// is not dropped shows at the same file and its lines overlap the hunk's; a "Shows at" with no line covers the whole
// file. Hunks in a file a feature file covers (Verify Work's feature map) come first: those are the ones a user sees.
// It lists and ranks; which hunks hold a choice the user should have made is the agent's and the reviewer's call (P2).
// Usage: drift.mjs --base <ref> (--record <record.md|task ID> | --list <file|->) [--root <repository>] [--json]
// --record reads the task's decisions.md beside its record; a task ID (project/task-NNN or task-NNN) is looked up in
// the Freeflow store (FREEFLOW_HOME, default ~/.freeflow). --list reads a decision list from a file or stdin. The
// change is the working tree against the base: tracked changes and untracked files. Exit code 0 when the list is
// written, 1 when the decision list has errors, 2 on a usage or Git error.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { parseChoices } from "./lib/choices.mjs";

const USAGE =
  "Usage: drift.mjs --base <ref> (--record <record.md|task ID> | --list <file|->) [--root <repository>] [--json]";
const DOCS_CHECK = resolve(dirname(fileURLToPath(import.meta.url)), "../../write-docs/scripts/docs-check.mjs");
const TASK_ID = /^(?:([a-z0-9-]+)\/)?(task-\d{3,})$/;

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      base: { type: "string" },
      record: { type: "string" },
      list: { type: "string" },
      root: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (!values.base) fail(USAGE);
if (Boolean(values.list) === Boolean(values.record))
  fail(`give --record <record.md|task ID> or --list <file|->\n${USAGE}`);

const git = (cwd, args) =>
  execFileSync("git", ["-c", "core.quotePath=false", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
let root;
try {
  root = git(resolve(values.root ?? "."), ["rev-parse", "--show-toplevel"]).trim();
  git(root, ["rev-parse", "--verify", "--quiet", `${values.base}^{commit}`]);
} catch {
  fail(root ? `no such commit: ${values.base}` : "not inside a Git repository");
}

/** A task's record.md: the path given, or the task ID's folder in the Freeflow store. */
function recordPath(given) {
  if (existsSync(resolve(given))) return resolve(given);
  const id = TASK_ID.exec(given);
  if (!id) fail(`no such record: ${given}`);
  const home = resolve(process.env.FREEFLOW_HOME || join(homedir(), ".freeflow"));
  const tasks = id[1] ? join(home, "projects", id[1], "tasks") : join(home, "tasks");
  const folder = existsSync(tasks)
    ? readdirSync(tasks).find((name) => name === id[2] || name.startsWith(`${id[2]}-`))
    : undefined;
  if (!folder) fail(`no task ${given} in the Freeflow store at ${home}`);
  return join(tasks, folder, "record.md");
}

let listText;
if (values.record) {
  const listPath = join(dirname(recordPath(values.record)), "decisions.md");
  if (!existsSync(listPath)) fail(`no decision list at ${listPath}; Track Work keeps it there`);
  listText = readFileSync(listPath, "utf8");
} else if (values.list === "-") listText = readFileSync(0, "utf8");
else if (!existsSync(resolve(values.list))) fail(`no such list: ${values.list}`);
else listText = readFileSync(resolve(values.list), "utf8");

const list = parseChoices(listText);
if (!list.ok)
  fail(`Decision list has ${list.errors.length} error(s):\n${list.errors.map((each) => `- ${each}`).join("\n")}`, 1);

/** Where each item that is not dropped shows: "Shows at: src/a.ts:12, src/b.ts:3-9, docs/c.md". */
const places = list.items
  .filter((item) => item.state !== "dropped")
  .flatMap((item) => {
    const shows = /\bShows at:\s*(.+)$/i.exec(item.text);
    if (!shows) return [];
    return shows[1].split(/[,;]\s*|\s+and\s+/).flatMap((part) => {
      const place = /^`?([^\s`:]+)(?::(\d+)(?:-(\d+))?)?`?\.?$/.exec(part.trim());
      if (!place) return [];
      const start = place[2] ? Number(place[2]) : null;
      return [{ item: item.id, file: place[1], start, end: place[3] ? Number(place[3]) : start }];
    });
  });

// The change's hunks: each one's file, its lines in the changed file, and its first changed line.
const hunks = [];
let file = null;
let current = null;
for (const text of git(root, ["diff", "--no-color", "--no-ext-diff", "--unified=0", values.base]).split("\n")) {
  const header = /^\+\+\+ (?:b\/(.*)|\/dev\/null)$/.exec(text);
  if (header) {
    // A deleted file's "+++ /dev/null" keeps the old path its "--- a/" line named.
    file = header[1] ?? file;
    continue;
  }
  const removed = /^--- (?:a\/(.*)|\/dev\/null)$/.exec(text);
  if (removed) {
    file = removed[1] ?? null;
    continue;
  }
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(text);
  if (hunk) {
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    current = { file, start: Math.max(start, 1), end: Math.max(start + count - 1, start, 1), first: null };
    hunks.push(current);
  } else if (current && /^[+-]/.test(text)) {
    // The first line the hunk adds, or for a hunk that only removes, the first line it removes.
    if (text[0] === "+" && (current.first === null || current.first.startsWith("removed: ")))
      current.first = text.slice(1).trim().slice(0, 160);
    else if (text[0] === "-" && current.first === null)
      current.first = `removed: ${text.slice(1).trim()}`.slice(0, 160);
  }
}
for (const path of git(root, ["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean)) {
  let lines = [];
  try {
    lines = readFileSync(join(root, path), "utf8").split("\n");
  } catch {
    // Unreadable: listed with no first line.
  }
  if (lines.at(-1) === "") lines.pop();
  hunks.push({
    file: path,
    start: 1,
    end: Math.max(lines.length, 1),
    first: (lines.find((line) => line.trim()) ?? "").trim().slice(0, 160),
  });
}

// The files a feature file covers: a user sees what changes there.
const files = [...new Set(hunks.map((each) => each.file))];
const userVisible = new Set();
if (files.length) {
  const result = spawnSync(
    process.execPath,
    [DOCS_CHECK, ...files.flatMap((path) => ["--covering", path]), "--root", root, "--json"],
    { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (result.status === 0)
    for (const { path, documents } of JSON.parse(result.stdout).paths)
      for (const doc of documents) {
        let text = "";
        try {
          text = readFileSync(join(root, doc.path), "utf8");
        } catch {
          continue;
        }
        if (/^## Driving it\b/m.test(text)) userVisible.add(path);
      }
}

const covers = (place, hunk) =>
  place.file === hunk.file && (place.start === null || (place.start <= hunk.end && place.end >= hunk.start));
const uncovered = hunks
  .filter((hunk) => !places.some((place) => covers(place, hunk)))
  .map((hunk) => ({ ...hunk, userVisible: userVisible.has(hunk.file) }))
  .sort((x, y) => Number(y.userVisible) - Number(x.userVisible) || x.file.localeCompare(y.file) || x.start - y.start);

if (values.json)
  console.log(
    JSON.stringify(
      {
        command: "drift",
        base: values.base,
        hunks: hunks.length,
        covered: hunks.length - uncovered.length,
        places: places.length,
        uncovered,
      },
      null,
      2,
    ),
  );
else {
  const range = (hunk) => (hunk.start === hunk.end ? `${hunk.start}` : `${hunk.start}-${hunk.end}`);
  console.log(
    `Drift against ${values.base}: ${uncovered.length} of ${hunks.length} hunk(s) shown at by no decision item${uncovered.length ? ", those a feature file covers first:" : "."}`,
  );
  for (const hunk of uncovered)
    console.log(
      `- ${hunk.file}:${range(hunk)}${hunk.userVisible ? " (a feature file covers it)" : ""}: ${hunk.first ?? ""}`.trimEnd(),
    );
  if (uncovered.length)
    console.log("Each is a choice nobody agreed, or a mechanical change: judge which, and add or name the item.");
}
