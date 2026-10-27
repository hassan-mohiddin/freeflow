// What a worker actually read, so a code citation can be checked against it: a cited range must overlap a range the
// worker read, not only exist at the commit. Reads come from a Claude Code transcript (its Read calls, and Bash
// commands that print a file or part of one) or from a reads file written in the same shape by hand or by another
// host's tooling: one JSON object per line, {"source", "path", "start", "end"}, with end null for a whole file.

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const READ_DEFAULT_LINES = 2000;

/** Split a shell command into words, keeping quoted strings together. Enough for the forms read below. */
function shellWords(command) {
  return [...command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3]);
}

/**
 * The reads a Bash command makes: `sed -n 'A,Bp' file`, `cat file`, `head -n N file`, `nl ... file`, and
 * `git show <commit>:<path>` (with `-C <dir>`). Paths are returned as given, with the folder the command ran in.
 */
export function readsInCommand(command) {
  const found = [];
  for (const part of command.split(/&&|\|\||;|\|/)) {
    const words = shellWords(part.trim());
    const [program] = words;
    if (program === "sed") {
      const range = words.find((word) => /^\d+(,\d+)?p$/.test(word));
      const file = words.at(-1);
      if (range && file && file !== range) {
        const [start, end] = range.slice(0, -1).split(",").map(Number);
        found.push({ path: file, start, end: end ?? start });
      }
    } else if (program === "cat" || program === "nl") {
      for (const file of words.slice(1).filter((word) => !word.startsWith("-")))
        found.push({ path: file, start: 1, end: null });
    } else if (program === "head") {
      const at = words.findIndex((word) => word === "-n");
      const count = at >= 0 ? Number(words[at + 1]) : Number(/^-(\d+)$/.exec(words[1] ?? "")?.[1] ?? 10);
      const file = words.at(-1);
      if (file && !file.startsWith("-") && Number.isFinite(count)) found.push({ path: file, start: 1, end: count });
    } else if (program === "git") {
      const dir = words.includes("-C") ? words[words.indexOf("-C") + 1] : null;
      const show = words.indexOf("show");
      const spec = show >= 0 ? words.slice(show + 1).find((word) => /^[0-9a-f]{7,40}:/.test(word)) : null;
      if (spec) {
        const [commit, ...rest] = spec.split(":");
        found.push({ commit, repoPath: rest.join(":"), dir, start: 1, end: null });
      }
    }
  }
  return found;
}

/**
 * Reads from Claude Code transcript lines, mapped to ledger sources: `clones` maps a repository name to its local
 * clone, and `pins` maps a source ID to {repo, commit}. A read outside every clone is left out.
 */
export function readsFromTranscript(text, { clones, pins }) {
  const sources = [...pins.entries()];
  const sourceFor = (absolute) => {
    for (const [id, pin] of sources) {
      const clone = clones.get(pin.repo);
      if (!clone) continue;
      const path = relative(resolve(clone), absolute);
      if (!path.startsWith("..") && path !== "") return { source: id, path };
    }
    return null;
  };
  const reads = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "Read" && block.input?.file_path) {
        const where = sourceFor(resolve(block.input.file_path));
        if (!where) continue;
        const start = Number(block.input.offset) > 0 ? Number(block.input.offset) : 1;
        const limit = Number(block.input.limit) > 0 ? Number(block.input.limit) : READ_DEFAULT_LINES;
        reads.push({ ...where, start, end: start + limit - 1 });
      } else if (block.name === "Bash" && typeof block.input?.command === "string") {
        for (const read of readsInCommand(block.input.command)) {
          if (read.commit) {
            const pinned = sources.find(
              ([, pin]) => pin.commit.startsWith(read.commit) || read.commit.startsWith(pin.commit),
            );
            if (pinned) reads.push({ source: pinned[0], path: read.repoPath, start: read.start, end: read.end });
          } else {
            const where = sourceFor(resolve(read.path));
            if (where) reads.push({ ...where, start: read.start, end: read.end });
          }
        }
      }
    }
  }
  return reads;
}

/** A reads file: one {"source", "path", "start", "end"} per line. */
export function loadReads(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/** Whether a cited range of a source's file overlaps a range that was read. */
export function wasRead(reads, { source, path, start, end }) {
  return reads.some(
    (read) =>
      read.source === source &&
      read.path === path &&
      read.start <= end &&
      (read.end === null || read.end === undefined || read.end >= start),
  );
}
