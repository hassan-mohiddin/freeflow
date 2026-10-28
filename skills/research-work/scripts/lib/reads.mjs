// What a worker actually read, so a code citation can be checked against it: every line of a cited range must lie in a
// range the worker read, not only exist at the commit. Reads come from a Claude Code transcript (its Read calls, and Bash
// commands that print a file or part of one) or from a reads file written in the same shape by hand or by another
// host's tooling: one JSON object per line, {"source", "path", "start", "end"}, with end null for a whole file.

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const READ_DEFAULT_LINES = 2000;

/** Split a shell command at the given separators, leaving quoted strings whole (a sed script holds `;`). */
function splitOutsideQuotes(command, separators) {
  const parts = [];
  let current = "";
  let quote = null;
  for (let at = 0; at < command.length; at++) {
    const char = command[at];
    if (quote) {
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    const separator = separators.find((candidate) => command.startsWith(candidate, at));
    if (separator) {
      parts.push(current);
      current = "";
      at += separator.length - 1;
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Split a shell command into words, keeping quoted strings together and dropping redirections. */
function shellWords(command) {
  const words = [...command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3]);
  const kept = [];
  for (let at = 0; at < words.length; at++) {
    if (/^\d*[<>]+&?\d*$/.test(words[at])) at++;
    else if (!/^\d*[<>]/.test(words[at])) kept.push(words[at]);
  }
  return kept;
}

/** A sed script of print ranges, such as '1,60p;300,400p', as [start, end] pairs; null for any other script. */
function sedRanges(word) {
  if (!/^\d+(,\d+)?p(;\d+(,\d+)?p)*;?$/.test(word)) return null;
  return word
    .split(";")
    .filter(Boolean)
    .map((range) => {
      const [start, end] = range.slice(0, -1).split(",").map(Number);
      return [start, end ?? start];
    });
}

/** The lines a command prints of a file it names: [{file, start, end}], or null when it reads no file. */
function fileReads(words) {
  const [program] = words;
  const operands = words.slice(1).filter((word) => !word.startsWith("-"));
  if (program === "sed") {
    const script = words.slice(1).find((word) => sedRanges(word));
    const file = words.at(-1);
    if (!script || !file || file === script) return null;
    return sedRanges(script).map(([start, end]) => ({ file, start, end }));
  }
  if (program === "cat" || program === "nl") {
    const files = program === "nl" ? operands.filter((word) => !/^\d+$/.test(word)) : operands;
    return files.length > 0 ? files.map((file) => ({ file, start: 1, end: null })) : null;
  }
  if (program === "head" || program === "tail") {
    const at = words.indexOf("-n");
    const count = at >= 0 ? words[at + 1] : (/^-(\d+)$/.exec(words[1] ?? "")?.[1] ?? "10");
    const file = words.at(-1);
    if (!file || file.startsWith("-") || file === count || file === program) return null;
    if (program === "head" && /^\d+$/.test(count)) return [{ file, start: 1, end: Number(count) }];
    if (program === "tail" && /^\+\d+$/.test(count)) return [{ file, start: Number(count.slice(1)), end: null }];
  }
  return null;
}

/** How a later stage of a pipeline narrows the lines before it: [start, end] of its input, identity, or null. */
function stageFilter(words) {
  const [program] = words;
  if ((program === "cat" || program === "nl") && words.slice(1).every((word) => word.startsWith("-")))
    return "identity";
  if (program === "sed" && words.length <= 3) {
    const ranges = sedRanges(words.at(-1));
    if (ranges?.length === 1) return ranges[0];
  }
  if (program === "head" && fileReads(words) === null) {
    const at = words.indexOf("-n");
    const count = Number(at >= 0 ? words[at + 1] : (/^-(\d+)$/.exec(words[1] ?? "")?.[1] ?? 10));
    if (Number.isFinite(count)) return [1, count];
  }
  return null;
}

/**
 * The reads a Bash command makes: `sed -n 'A,Bp' file` (several ranges too), `cat file`, `nl file`, `head -n N
 * file`, `tail -n +N file`, and `git show <commit>:<path>` (with `-C <dir>`), each followed through a pipeline: a
 * later `sed -n`, `head` or `cat -n` narrows what was shown, and any other stage (grep, wc) shows an unknown part, so
 * the read is left out. `cd <dir>` moves the folder relative paths resolve against, starting at `cwd`.
 */
export function readsInCommand(command, cwd = null) {
  const found = [];
  let dir = cwd;
  const place = (file) => (dir ? resolve(dir, file) : file);
  for (const statement of splitOutsideQuotes(command, ["&&", "||", ";", "\n"])) {
    const piped = splitOutsideQuotes(statement, ["|"]);
    // Output sent to a file was not shown to the worker, so it is not a read.
    if (/(^|\s)(1?>>?|&>)/.test(piped.at(-1).replace(/'[^']*'|"[^"]*"/g, ""))) continue;
    const stages = piped.map(shellWords);
    const [first, ...rest] = stages;
    if (!first?.length) continue;
    if (first[0] === "cd" && stages.length === 1) {
      if (first[1]) dir = dir ? resolve(dir, first[1]) : first[1];
      continue;
    }
    if (first[0] === "git") {
      const at = first.indexOf("-C");
      const repoDir = at >= 0 ? place(first[at + 1]) : dir;
      const show = first.indexOf("show");
      const spec = show >= 0 ? first.slice(show + 1).find((word) => /^[0-9a-f]{7,40}:/.test(word)) : null;
      if (spec && rest.length === 0) {
        const [commit, ...path] = spec.split(":");
        found.push({ commit, repoPath: path.join(":"), dir: repoDir, start: 1, end: null });
      }
      continue;
    }
    let reads = fileReads(first);
    if (!reads) continue;
    for (const stage of rest) {
      const filter = stageFilter(stage);
      if (filter === "identity") continue;
      // Line numbers after the first stage count lines of its output, which map back only for one contiguous range.
      if (!filter || reads.length !== 1) {
        reads = [];
        break;
      }
      const [read] = reads;
      const start = read.start + filter[0] - 1;
      const end = Math.min(read.end ?? Infinity, read.start + filter[1] - 1);
      reads = start <= end ? [{ ...read, start, end }] : [];
    }
    for (const read of reads) found.push({ path: place(read.file), start: read.start, end: read.end });
  }
  return found;
}

/**
 * Reads from Claude Code transcript lines, mapped to ledger sources: `clones` maps a repository name to its local
 * clone, `pins` maps a source ID to {repo, commit}, and `heads` maps a repository name to its clone's checked-out
 * commit. A read of a clone's files counts for a source only when that clone is at the source's pinned commit (as it
 * is now: the transcript does not say where it was then), since otherwise the lines read are not the pinned lines. A
 * read outside every clone is left out.
 */
export function readsFromTranscript(text, { clones, pins, heads = new Map() }) {
  const sources = [...pins.entries()];
  const atPin = (repo, commit) => {
    const head = heads.get(repo);
    return head === undefined || head.startsWith(commit) || commit.startsWith(head);
  };
  const sourceFor = (absolute) => {
    for (const [id, pin] of sources) {
      const clone = clones.get(pin.repo);
      if (!clone || !atPin(pin.repo, pin.commit)) continue;
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
        for (const read of readsInCommand(block.input.command, entry.cwd ?? null)) {
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

/** Whether every line of a cited range of a source's file lies in a range that was read. */
export function wasRead(reads, { source, path, start, end }) {
  const ranges = reads
    .filter((read) => read.source === source && read.path === path)
    .map((read) => [read.start, read.end ?? Infinity])
    .sort((a, b) => a[0] - b[0]);
  let covered = start - 1;
  for (const [from, to] of ranges) {
    if (from > covered + 1) break;
    covered = Math.max(covered, to);
    if (covered >= end) return true;
  }
  return covered >= end;
}
