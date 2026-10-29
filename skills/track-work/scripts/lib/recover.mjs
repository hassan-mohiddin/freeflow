import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { parseDocument, sectionContentLines } from "./document.mjs";
import { renderResume } from "./views.mjs";

// Recovery in one call (Track Work, "Recover After Context Loss"): the resume view, then what each defining artifact
// and Recovery source points to and whether it can be read now, then where live Git state disagrees with the record.
// It reports; reading the sources and reconciling stays the agent's work.
//
// It also finds the evidence pointers in Material updates for `validate`: files and commits a later context will
// rely on. A pointer inside the repository that does not resolve is a problem; one outside it is reported, not checked.

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
  for (const word of prose.split(/[\s,;()[\]"'“”]+/)) {
    const token = word.replace(/[.:]+$/, "");
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

// Where a path pointer resolves: the repository root, the task folder, or as given when absolute or home-relative.
export function resolvePointer(pointer, { root, taskDir }) {
  if (pointer.startsWith("~/")) return { outside: true, path: join(homedir(), pointer.slice(2)) };
  if (isAbsolute(pointer)) {
    const inside = !relative(root, pointer).startsWith("..");
    return { outside: !inside, path: pointer };
  }
  const candidates = [join(taskDir, pointer), join(root, pointer)];
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
    return { text, trigger, pointers: pointersIn(line).map((pointer) => checkPointer(pointer, context)) };
  });
}

function liveState(document, context) {
  const { root } = context;
  if (!context.isGit) return { git: false, mismatches: [], notes: ["not a Git repository: no live state to compare"] };
  const branch = git(root, ["branch", "--show-current"]) || null;
  const head = git(root, ["rev-parse", "--short=12", "HEAD"]);
  const subject = head ? git(root, ["log", "-1", "--format=%s"]) : null;
  const dirty = (git(root, ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean).length;
  const mismatches = [];
  const notes = [];
  const current = document.sections["Current Work"];
  const sliceText = current ? document.lines.slice(current.start, current.end).join("\n") : "";
  const contextText = sectionContentLines(document, "Current Context").join("\n");
  const branches = (git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]) ?? "")
    .split("\n")
    .filter(Boolean);
  const named = branches.filter((name) =>
    new RegExp(`(^|[\\s\`(])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s\`),.;:]|$)`).test(
      `${sliceText}\n${contextText}`,
    ),
  );
  if (!branch) mismatches.push(`HEAD is detached at ${head}`);
  else if (named.length && !named.includes(branch))
    mismatches.push(`the record names branch ${named.join(", ")}; HEAD is on ${branch}`);
  const commits = [...new Set(pointersIn(sliceText.replace(/\n/g, " ")).filter((each) => each.kind === "commit"))];
  for (const { value } of commits) {
    const full = git(root, ["rev-parse", "--verify", "--quiet", `${value}^{commit}`]);
    if (!full) mismatches.push(`the Current Slice names commit ${value}, which this repository does not have`);
    else if (head && git(root, ["merge-base", "--is-ancestor", full, "HEAD"]) === null)
      mismatches.push(`the Current Slice names commit ${value}, which is not in HEAD's history`);
  }
  const updated = /^Last updated:\s*(\S+)/m.exec(document.lines.slice(0, 10).join("\n"))?.[1];
  if (updated && head) {
    const since = (git(root, ["log", "--oneline", `--since=${updated}`, "HEAD"]) ?? "").split("\n").filter(Boolean);
    if (since.length)
      notes.push(
        `${since.length} commit(s) on HEAD since the record's Last updated (${updated}); it may not describe them`,
      );
  }
  if (dirty) notes.push(`${dirty} uncommitted or untracked path(s)`);
  return { git: true, branch, head, subject, dirty, namedBranches: named, mismatches, notes };
}

export function contextFor(root, recordPath) {
  return {
    root,
    taskDir: dirname(recordPath),
    isGit: git(root, ["rev-parse", "--is-inside-work-tree"]) === "true",
  };
}

export function gitRoot(root) {
  return git(root, ["rev-parse", "--show-toplevel"]) ?? root;
}

export function renderRecover(text, { root, recordPath }) {
  const document = parseDocument(text);
  const context = contextFor(gitRoot(root), recordPath);
  const defines = document.context.headings.get("What defines this task");
  const defining = sourceEntries(document.lines.slice(defines.start, defines.end), context);
  const sources = document.current.recoverySources;
  const recovery = sources ? sourceEntries(document.lines.slice(sources.start, sources.end), context) : [];
  const live = liveState(document, context);
  const pointerLine = (pointer) =>
    `${pointer.value}: ${pointer.state}${pointer.size ? ` (${pointer.size})` : ""}${pointer.outside && pointer.size ? ", outside the repository" : ""}`;
  const entryLines = (entries, withTrigger) =>
    entries.length
      ? entries.flatMap((entry) => [
          `- ${entry.text}`,
          ...(withTrigger ? [`  - ${entry.trigger ? `read when ${entry.trigger}` : "read now"}`] : []),
          ...(entry.pointers.length
            ? entry.pointers.map((pointer) => `  - ${pointerLine(pointer)}`)
            : ["  - no pointer found: recover it from the text"]),
        ])
      : ["None."];
  const lines = [
    "## Recovery",
    "",
    "Read in this order: every defining artifact, then each Recovery source whose trigger applies, then the History entries the next action depends on (`view entry <ID>`).",
    "",
    "### Defining artifacts",
    "",
    ...entryLines(defining, false),
    "",
    "### Recovery sources",
    "",
    ...entryLines(recovery, true),
    "",
    "### Live state",
    "",
    ...(live.git
      ? [
          `- ${live.branch ? `branch ${live.branch}` : "detached HEAD"}, HEAD ${live.head ?? "none"}${live.subject ? ` (${live.subject})` : ""}`,
        ]
      : []),
    ...live.notes.map((note) => `- ${note}`),
    ...(live.mismatches.length
      ? ["", "Mismatches: resolve each from sources before acting.", ...live.mismatches.map((each) => `- ${each}`)]
      : ["- no mismatch found between the record and live Git state"]),
  ];
  const resume = renderResume(text);
  return `${resume.trimEnd()}${document.newline}${document.newline}${lines.join(document.newline)}${document.newline}`;
}

// Evidence pointers in every Material updates list. An unresolved pointer inside the repository is a problem on an
// Evidence or Result line, which claims it exists, and a warning on any other line (an Extension may name a planned
// path); the caller decides whether problems fail. Pointers outside the repository are listed, not checked.
export function checkEvidencePointers(text, { root, recordPath }) {
  const document = parseDocument(text);
  const lines = document.lines;
  const updates = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^#####\s+Material updates\s*$/.test(lines[index])) continue;
    for (let at = index + 1; at < lines.length && !/^#{1,5}\s/.test(lines[at]); at += 1)
      updates.push({ index: at, line: lines[at] });
  }
  return checkLinePointers(updates, { root, recordPath });
}

/** The pointers on the given update lines ({ index, line }), checked as checkEvidencePointers checks them. */
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
