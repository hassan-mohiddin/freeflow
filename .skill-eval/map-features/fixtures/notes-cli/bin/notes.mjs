#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const dir = process.env.NOTES_DATA_DIR || join(homedir(), ".notes");
const file = join(dir, "notes.json");

function load() {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function save(notes) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(notes, null, 2)}\n`);
}

function usage() {
  console.error("usage: notes add <text> | list | search <word> | clear [--yes]");
  process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const notes = load();

if (command === "add") {
  const text = rest.join(" ").trim();
  if (!text) usage();
  const id = notes.reduce((max, note) => Math.max(max, note.id), 0) + 1;
  notes.push({ id, text });
  save(notes);
  console.log(`added ${id}`);
} else if (command === "list") {
  for (const note of notes) console.log(`${note.id}  ${note.text}`);
} else if (command === "search") {
  const word = rest.join(" ").trim();
  if (!word) usage();
  for (const note of notes) if (note.text.includes(word)) console.log(`${note.id}  ${note.text}`);
} else if (command === "clear") {
  if (!rest.includes("--yes")) {
    if (!process.stdin.isTTY) {
      console.error("clear needs a terminal to confirm; pass --yes to skip the question");
      process.exit(2);
    }
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question(`Delete all ${notes.length} notes? [y/N] `);
    prompt.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log("kept all notes");
      process.exit(0);
    }
  }
  save([]);
  console.log(`deleted ${notes.length} notes`);
} else {
  usage();
}
