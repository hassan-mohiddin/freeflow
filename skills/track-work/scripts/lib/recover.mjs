import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";

// Pointers in a record's lines, found and resolved: what each Read on recovery, Read when, Defined by and Carry entry
// points to and whether it can be read now (the budget and the views), and the pointers on a Slice's update lines for
// `validate`: files and commits a later context will rely on. A pointer inside the repository that does not resolve
// is a problem; one outside it is reported, not checked.

const PATH_TOKEN = /^(~\/|\/|\.{1,2}\/)?[A-Za-z0-9_@.-]+(\/[A-Za-z0-9_@.()-]+)*\/?(#[^\s]*)?$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const URL = /^[a-z][a-z0-9+.-]*:\/\//i;

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// A path names a file with an extension, a directory with a trailing "/", or starts like one (./, ../, ~/, /). Slashed
// words such as "lost/weakened" or "17/9" are not paths.
const looksLikePath = (token) =>
  PATH_TOKEN.test(token) &&
  !COMMIT.test(token) &&
  !token.includes("*") &&
  (/^(~\/|\/|\.{1,2}\/)/.test(token) ||
    /\/$/.test(token) ||
    (/\.[A-Za-z][A-Za-z0-9]{0,7}(#.*)?$/.test(token) && (token.includes("/") || /^[^.]+\.[A-Za-z]/.test(token))));
const looksLikeCommit = (token) => COMMIT.test(token) && /\d/.test(token) && /[a-f]/.test(token);

// The pointers a line names: backticked tokens, Markdown link targets, a leading "pointer — ..." token, typed
// trail pointers (commit:<sha>, file:<path>), and bare commit hashes.
export function pointersIn(line) {
  const found = [];
  const add = (kind, value) => {
    if (!found.some((each) => each.kind === kind && each.value === value)) found.push({ kind, value });
  };
  const text = line.replace(/^\s*[-*]\s+/, "");
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) classify(match[1], add);
  for (const match of text.matchAll(/`([^`\n]+)`/g)) classify(match[1].trim(), add);
  const lead = /^(\S+)\s+[—–-]\s/.exec(text);
  if (lead) classify(lead[1].replace(/[,;:]$/, ""), add);
  const prose = text.replace(/`[^`\n]*`/g, " ").replace(/\]\([^)]*\)/g, " ");
  for (const match of prose.matchAll(/\b(?:commit|file|path):([^\s,;)]+)/g))
    classify(match[1], add, match[0].startsWith("commit:"));
  let previous = "";
  for (const word of prose.split(/[\s,;()[\]"'“”]+/)) {
    const token = word.replace(/[.:]+$/, "");
    // A hex word after "session" is a session's ID, as a Slice names the session it ran in, not a commit.
    const afterSession = /^session$/i.test(previous);
    previous = token;
    if (afterSession && COMMIT.test(token)) continue;
    if (looksLikeCommit(token)) add("commit", token);
    // A bare path in prose must name a file: a slashed word ending in "/" is usually a folder named in passing.
    else if (token.includes("/") && !token.endsWith("/") && looksLikePath(token) && !URL.test(token))
      add("path", token.replace(/#.*$/, ""));
  }
  return found;
}

function classify(raw, add, commitOnly = false) {
  const token = raw.replace(/^(file|path|commit):/, "");
  if (URL.test(token)) return add("url", token);
  if (commitOnly || looksLikeCommit(token)) return add("commit", token);
  const range = /^([0-9a-f]{7,40})\.\.\.?([0-9a-f]{7,40}|HEAD)$/.exec(token);
  if (range) {
    add("commit", range[1]);
    if (range[2] !== "HEAD") add("commit", range[2]);
    return;
  }
  if (looksLikePath(token)) add("path", token.replace(/#.*$/, ""));
}

// Where a path pointer resolves: the task folder, the repository root, then each repository the record names in Space
// at its path on this machine; or as given when absolute or home-relative.
export function resolvePointer(pointer, { root, taskDir, repositories = [] }) {
  if (pointer.startsWith("~/")) return { outside: true, path: join(homedir(), pointer.slice(2)) };
  if (isAbsolute(pointer)) {
    const inside = [root, ...repositories].some((top) => !relative(top, pointer).startsWith(".."));
    return { outside: !inside, path: pointer };
  }
  const candidates = [join(taskDir, pointer), join(root, pointer), ...repositories.map((top) => join(top, pointer))];
  const hit = candidates.find((candidate) => existsSync(candidate));
  return { outside: false, path: hit ?? candidates[1] };
}

function describe(path) {
  try {
    const stat = statSync(path);
    if (stat.isDirectory()) return `directory, ${readdirSync(path).length} entries`;
    const text = readFileSync(path, "utf8");
    return `${text.split("\n").length} lines, ${text.split(/\s+/).filter(Boolean).length} words`;
  } catch {
    return null;
  }
}

function checkPointer(pointer, context) {
  if (pointer.kind === "url") return { ...pointer, state: "not checked (URL)" };
  if (pointer.kind === "commit") {
    if (!context.isGit) return { ...pointer, state: "not checked (not a Git repository)" };
    const full = git(context.root, ["rev-parse", "--verify", "--quiet", `${pointer.value}^{commit}`]);
    return full
      ? { ...pointer, state: "resolves", commit: full }
      : { ...pointer, state: "missing", problem: `commit ${pointer.value} is not in this repository` };
  }
  const where = resolvePointer(pointer.value, context);
  const size = describe(where.path);
  if (size) return { ...pointer, state: "resolves", size, ...(where.outside ? { outside: true } : {}) };
  if (where.outside) return { ...pointer, state: "not checked (outside the repository)", outside: true };
  return { ...pointer, state: "missing", problem: `${pointer.value} does not exist` };
}

const bullets = (lines) => lines.filter((line) => /^\s*[-*]\s+\S/.test(line));

export function sourceEntries(lines, context) {
  return bullets(lines).map((line) => {
    const text = line.trim().replace(/^[-*]\s+/, "");
    const trigger = /\bread (?:only )?(?:when|if) ([^.;]+)/i.exec(text)?.[1]?.trim() ?? null;
    const found = pointersIn(line);
    // An entry that leads with a bare file name, as "AGENTS.md (in the repository): …" does, points to that file.
    const lead = /^([^\s/(]+\.[A-Za-z][A-Za-z0-9]{0,7})(?=[\s:(]|$)/.exec(text)?.[1];
    if (lead && !found.some((pointer) => pointer.kind === "path"))
      classify(lead, (kind, value) => found.push({ kind, value }));
    return { text, trigger, pointers: found.map((pointer) => checkPointer(pointer, context)) };
  });
}

export function contextFor(root, recordPath, repositories = []) {
  return {
    root,
    taskDir: dirname(recordPath),
    repositories,
    isGit: git(root, ["rev-parse", "--is-inside-work-tree"]) === "true",
  };
}

export function gitRoot(root) {
  return git(root, ["rev-parse", "--show-toplevel"]) ?? root;
}

/**
 * The pointers on the given update lines ({ index, line }). An unresolved pointer inside the repository is a problem on
 * an Evidence or Result line, which claims it exists, and a warning on any other line (an Extension may name a planned
 * path); the caller decides whether problems fail. Pointers outside the repository are listed, not checked.
 */
export function checkLinePointers(updates, { root, recordPath }) {
  const context = contextFor(gitRoot(root), recordPath);
  const problems = [];
  const warnings = [];
  const outside = [];
  let checked = 0;
  for (const { index, line } of updates) {
    for (const pointer of pointersIn(line)) {
      if (pointer.kind === "url") continue;
      const result = checkPointer(pointer, context);
      const claims = /^\s*[-*]\s+(Evidence|Result)\b/.test(line);
      if (result.problem) (claims ? problems : warnings).push(`line ${index + 1}: ${result.problem}`);
      else if (result.outside || result.state.startsWith("not checked"))
        outside.push(`line ${index + 1}: ${pointer.value}`);
      if (!result.outside && !result.state.startsWith("not checked")) checked += 1;
    }
  }
  return { checked, problems, warnings, outside };
}
