import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SkillAuthorError } from "./skill-author.mjs";

// Before/after loss check for model-facing Markdown: splits every base file into units (frontmatter description,
// bullet, numbered step, table row, prose sentence) and looks for each one in the new tree.
//   kept       the unit's text, whitespace aside, occurs in a searched file
//   edited     best score >= 0.6 in the same file
//   moved      best score >= 0.6 in another file
//   reworded   0.3 <= best score < 0.6
//   unmatched  best score < 0.3
// The two scores are reported separately: containment (share of the unit's 5-word shingles found in one file) and
// Jaccard (content-word overlap with one unit or sentence). Both are text measures: they show what text survived, not
// whether behavior did.

const SHINGLE_WORDS = 5;
const MIN_RULE_WORDS = 4;
const HIGH = 0.6;
const LOW = 0.3;
const CLASSES = ["kept", "edited", "moved", "reworded", "unmatched"];
const RULE_WORDS = /\b(never|always|must|only|do not|don't|stop)\b/i;
const INSTRUCTION_FILES = new Set(["AGENTS.md", "CLAUDE.md"]);
const WORKING_TREE = "working tree";
const STOPWORDS = new Set(
  "a an the and or of to in on for with by at as is are be it its this that these those not no do does from when what which who than then their there they them so if into any each per one only".split(
    " ",
  ),
);

function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = String(error.stderr || error.message)
      .trim()
      .split("\n")[0];
    throw new SkillAuthorError("git-failed", `git ${args[0]} failed: ${detail}`, 2);
  }
}

function hiddenOrVendored(file) {
  return file.split("/").some((segment) => segment.startsWith(".") || segment === "node_modules");
}

// Model-facing by default: Markdown inside a skill package (a directory holding SKILL.md) or a `prompts` directory, and
// AGENTS.md or CLAUDE.md, outside hidden directories. Anything else, such as a hidden skills folder, is named with
// --paths.
function modelFacing(files) {
  const packages = new Set(
    files
      .filter((file) => path.posix.basename(file) === "SKILL.md" && !hiddenOrVendored(file))
      .map((file) => path.posix.dirname(file)),
  );
  return (file) => {
    if (!file.endsWith(".md") || hiddenOrVendored(file)) return false;
    if (INSTRUCTION_FILES.has(path.posix.basename(file))) return true;
    if (file.split("/").slice(0, -1).includes("prompts")) return true;
    for (let directory = path.posix.dirname(file); directory !== "."; directory = path.posix.dirname(directory)) {
      if (packages.has(directory)) return true;
    }
    return packages.has(".");
  };
}

function underPaths(prefixes) {
  return (file) =>
    file.endsWith(".md") &&
    prefixes.some((prefix) => prefix === "" || file === prefix || file.startsWith(`${prefix}/`));
}

// A ref of null reads the working tree: tracked and untracked files that Git does not ignore.
async function readSide(root, ref, select) {
  let listed;
  let read;
  if (ref === null) {
    const files = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
      .split("\0")
      .filter(Boolean);
    listed = [...new Set(files)].filter((file) => existsSync(path.join(root, file)));
    read = (file) => readFile(path.join(root, file), "utf8");
  } else {
    listed = git(root, ["ls-tree", "-r", "-z", "--name-only", ref]).split("\0").filter(Boolean);
    read = async (file) => git(root, ["show", `${ref}:${file}`]);
  }
  const keep = select(listed);
  const tree = new Map();
  for (const file of listed.filter(keep).sort()) tree.set(file, await read(file));
  return { tree, listed: new Set(listed) };
}

// ---------- units ----------

function splitSentences(text) {
  const guarded = text.replace(/\b(e\.g|i\.e|etc|vs|incl)\./g, (match) => match.replace(/\./g, "\u0000"));
  const sentences = [];
  const pattern = /(?<=[.!?])\s+(?=[A-Z`"*[(_])/g;
  let start = 0;
  for (const match of guarded.matchAll(pattern)) {
    sentences.push({ offset: start, text: guarded.slice(start, match.index) });
    start = match.index + match[0].length;
  }
  sentences.push({ offset: start, text: guarded.slice(start) });
  return sentences
    .map((sentence) => ({ offset: sentence.offset, text: sentence.text.replace(/\u0000/g, ".").trim() }))
    .filter((sentence) => sentence.text);
}

export function splitUnits(file, contents) {
  const lines = contents.split(/\r?\n/);
  const units = [];
  let index = 0;

  if (lines[0] === "---") {
    let cursor = 1;
    while (cursor < lines.length && lines[cursor] !== "---") {
      const match = /^description:\s*(.*)$/.exec(lines[cursor]);
      if (match) {
        const start = cursor + 1;
        let value = match[1];
        if (/^[>|][-+]?\s*$/.test(value)) {
          value = "";
          while (cursor + 1 < lines.length && /^\s+/.test(lines[cursor + 1]))
            value += ` ${lines[(cursor += 1)].trim()}`;
        }
        value = value.trim().replace(/^["']|["']$/g, "");
        if (value)
          units.push({ file, line: start, endLine: cursor + 1, kind: "description", headings: [], text: value });
      }
      cursor += 1;
    }
    index = cursor + 1;
  }

  const headings = [];
  let fence = null;
  let open = null;
  const flush = () => {
    if (!open) return;
    if (open.kind === "prose") {
      const joined = open.parts.map((part) => part.text).join(" ");
      for (const sentence of splitSentences(joined)) {
        let line = open.parts[0].line;
        let consumed = 0;
        for (const part of open.parts) {
          if (consumed + part.text.length >= sentence.offset) {
            line = part.line;
            break;
          }
          consumed += part.text.length + 1;
        }
        units.push({ file, line, endLine: open.endLine, kind: "prose", headings: open.headings, text: sentence.text });
      }
    } else {
      const text = open.parts
        .map((part) => part.text)
        .join(" ")
        .trim();
      if (text)
        units.push({ file, line: open.line, endLine: open.endLine, kind: open.kind, headings: open.headings, text });
    }
    open = null;
  };

  for (; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = index + 1;
    const marker = /^\s*(`{3,}|~{3,})/.exec(raw);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (marker) {
      flush();
      fence = marker[1];
      continue;
    }
    const text = raw.replace(/^\s*>\s?/, "");
    if (/^\s*$/.test(text)) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(text);
    if (heading) {
      flush();
      headings.length = heading[1].length - 1;
      headings[heading[1].length - 1] = heading[2];
      continue;
    }
    if (/^\s*\|/.test(text)) {
      flush();
      const separator = /^\s*\|[\s:|-]+\|\s*$/;
      if (separator.test(text) || separator.test(lines[index + 1] ?? "")) continue;
      units.push({ file, line, endLine: line, kind: "table-row", headings: [...headings], text: text.trim() });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(text);
    const step = /^\s*\d+[.)]\s+(.*)$/.exec(text);
    if (bullet || step) {
      flush();
      open = {
        line,
        endLine: line,
        kind: step ? "step" : "bullet",
        headings: [...headings],
        parts: [{ line, text: (step ?? bullet)[1] }],
      };
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(text)) {
      flush();
      continue;
    }
    if (open) {
      open.parts.push({ line, text: text.trim() });
      open.endLine = line;
      continue;
    }
    open = { line, endLine: line, kind: "prose", headings: [...headings], parts: [{ line, text: text.trim() }] };
  }
  flush();
  return units;
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>|~]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\s/-]/g, " ")
    .replace(/(^|\s)['/-]+|['/-]+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (text) => (text ? normalize(text).split(" ").filter(Boolean) : []);
const contentWords = (words) => new Set(words.filter((word) => !STOPWORDS.has(word)));
const flatten = (text) => text.replace(/\s+/g, " ").trim();

function shingles(words) {
  const set = new Set();
  for (let index = 0; index + SHINGLE_WORDS <= words.length; index += 1) {
    set.add(words.slice(index, index + SHINGLE_WORDS).join(" "));
  }
  return set;
}

export function isRuleLike(unit) {
  const words = tokens(unit.text).length;
  if (words < MIN_RULE_WORDS || /:\s*$/.test(unit.text)) return false;
  return (
    unit.kind === "step" || unit.headings.some((heading) => /^rules$/i.test(heading)) || RULE_WORDS.test(unit.text)
  );
}

// ---------- matching ----------

function buildIndex(tree) {
  const files = [];
  const candidates = [];
  for (const [file, contents] of tree) {
    const units = splitUnits(file, contents);
    const lineShingles = new Map();
    for (const unit of units) {
      const words = tokens(unit.text);
      candidates.push({ file, line: unit.line, text: unit.text, words: contentWords(words) });
      if (unit.kind !== "prose") {
        const sentences = splitSentences(unit.text);
        if (sentences.length > 1) {
          for (const sentence of sentences) {
            candidates.push({ file, line: unit.line, text: sentence.text, words: contentWords(tokens(sentence.text)) });
          }
        }
      }
      for (const shingle of shingles(words)) {
        if (!lineShingles.has(shingle)) lineShingles.set(shingle, new Map());
        const lines = lineShingles.get(shingle);
        lines.set(unit.line, unit.text);
      }
    }
    files.push({
      file,
      flat: flatten(contents),
      unitsFlat: flatten(units.map((unit) => unit.text).join("\n")),
      lineShingles,
    });
  }
  const inverted = new Map();
  candidates.forEach((candidate, position) => {
    for (const word of candidate.words) {
      if (!inverted.has(word)) inverted.set(word, []);
      inverted.get(word).push(position);
    }
  });
  return { files, candidates, inverted };
}

const round = (value) => Number(value.toFixed(2));

function matchUnit(unit, index) {
  const needle = flatten(unit.text);
  for (const entry of index.files) {
    if (entry.flat.includes(needle) || entry.unitsFlat.includes(needle)) {
      return { class: "kept", file: entry.file, containment: null, jaccard: null };
    }
  }

  const words = tokens(unit.text);
  let containment = { score: 0, file: null, line: null, text: null };
  const own = shingles(words);
  if (own.size > 0) {
    for (const entry of index.files) {
      let found = 0;
      const hits = new Map();
      for (const shingle of own) {
        const lines = entry.lineShingles.get(shingle);
        if (!lines) continue;
        found += 1;
        for (const [line, text] of lines) hits.set(line, { count: (hits.get(line)?.count ?? 0) + 1, text });
      }
      const score = found / own.size;
      if (score > containment.score || (score === containment.score && score > 0 && entry.file === unit.file)) {
        let best = { count: 0, line: null, text: null };
        for (const [line, hit] of hits) if (hit.count > best.count) best = { count: hit.count, line, text: hit.text };
        containment = { score, file: entry.file, line: best.line, text: best.text };
      }
    }
  }

  const ownWords = contentWords(words);
  const overlap = new Map();
  for (const word of ownWords) {
    for (const position of index.inverted.get(word) ?? []) overlap.set(position, (overlap.get(position) ?? 0) + 1);
  }
  let jaccard = { score: 0, file: null, line: null, text: null };
  for (const [position, shared] of overlap) {
    const candidate = index.candidates[position];
    const score = shared / (ownWords.size + candidate.words.size - shared);
    if (score > jaccard.score) jaccard = { score, file: candidate.file, line: candidate.line, text: candidate.text };
  }

  const best = containment.score >= jaccard.score ? containment : jaccard;
  let matchClass = "unmatched";
  if (best.score >= HIGH) matchClass = best.file === unit.file ? "edited" : "moved";
  else if (best.score >= LOW) matchClass = "reworded";
  return {
    class: matchClass,
    file: best.file,
    containment: { ...containment, score: round(containment.score) },
    jaccard: { ...jaccard, score: round(jaccard.score) },
  };
}

// ---------- diff ----------

function removedLines(root, base, next, files) {
  const removed = new Map();
  if (files.length === 0) return removed;
  const args = [
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-renames",
    "--unified=0",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    base,
    ...(next === null ? [] : [next]),
    "--",
    ...files,
  ];
  let current = null;
  for (const line of git(root, args).split("\n")) {
    const header = /^--- (?:a\/(.*)|\/dev\/null)$/.exec(line);
    if (header) {
      current = header[1] ?? null;
      if (current && !removed.has(current)) removed.set(current, new Set());
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,(\d+))? /.exec(line);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      for (let offset = 0; offset < count; offset += 1) removed.get(current).add(start + offset);
    }
  }
  return removed;
}

// ---------- baselines ----------

// The default baseline: where this branch left the default branch, so committed and uncommitted edits both count.
function defaultBase(root) {
  const candidates = [];
  try {
    candidates.push(git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]).trim());
  } catch {
    // No remote default recorded.
  }
  candidates.push("main", "master", "origin/main", "origin/master");
  for (const candidate of candidates.filter(Boolean)) {
    try {
      git(root, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]);
    } catch {
      continue;
    }
    return { ref: git(root, ["merge-base", "HEAD", candidate]).trim(), from: `merge-base of HEAD and ${candidate}` };
  }
  throw new SkillAuthorError(
    "no-default-branch",
    "No default branch found (origin/HEAD, main or master); pass a base ref",
    2,
  );
}

function changedFiles(root, base, next) {
  const args = ["-c", "core.quotePath=false", "diff", "--name-only", "-z", "--no-renames", base];
  return new Set(
    git(root, next === null ? args : [...args, next])
      .split("\0")
      .filter(Boolean),
  );
}

async function readFolder(root, directory = root) {
  const tree = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [file, contents] of await readFolder(root, entryPath)) tree.set(file, contents);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      tree.set(path.relative(root, entryPath).split(path.sep).join("/"), await readFile(entryPath, "utf8"));
    }
  }
  return tree;
}

// Without Git, a base line counts as removed when the same file no longer has that exact line.
function folderRemovedLines(baseTree, newTree) {
  const removed = new Map();
  for (const [file, contents] of baseTree) {
    const remaining = new Map();
    for (const line of (newTree.get(file) ?? "").split(/\r?\n/)) remaining.set(line, (remaining.get(line) ?? 0) + 1);
    const lines = new Set();
    contents.split(/\r?\n/).forEach((line, index) => {
      if (remaining.get(line)) remaining.set(line, remaining.get(line) - 1);
      else lines.add(index + 1);
    });
    removed.set(file, lines);
  }
  return removed;
}

// ---------- verdicts ----------

async function readVerdicts(file) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    const reason = error?.code === "ENOENT" ? "does not exist" : "is not valid JSON";
    throw new SkillAuthorError("invalid-verdicts", `Verdicts file ${reason}: ${file}`, 2);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SkillAuthorError("invalid-verdicts", 'Verdicts file must be a JSON object of "file:line" keys', 2);
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new SkillAuthorError("invalid-verdicts", `Verdict for ${key} must be a non-empty string`, 2);
    }
  }
  return new Map(Object.entries(parsed));
}

// ---------- command ----------

function relativePaths(root, cwd, paths) {
  return paths.map((value) => {
    const relative = path.relative(root, path.resolve(cwd, value));
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new SkillAuthorError("path-outside-root", `Path is outside the compared tree: ${value}`, 2);
    }
    return relative.split(path.sep).join("/").replace(/\/$/, "");
  });
}

function selectFiles(all, prefixes, changed) {
  const files = [...all];
  const scope = prefixes ? underPaths(prefixes) : modelFacing(files);
  const facing = modelFacing(files);
  const named = prefixes ? underPaths(prefixes) : () => false;
  return {
    base: (file) => scope(file) && changed(file),
    search: (file) => facing(file) || named(file),
  };
}

// Three ways to choose the baseline: nothing (the merge-base with the default branch, against the working tree),
// explicit refs, or a folder copy for text kept outside Git (against a folder, by default the current one).
export async function compareGuidance({
  base = null,
  next = null,
  baseFolder = null,
  directory = null,
  paths = null,
  deletedOnly = false,
  verdicts = null,
  cwd = process.cwd(),
}) {
  let root;
  let baseTree;
  let searchTree;
  let removed = null;
  let baseListed;
  let baseLabel;
  let baseFrom;
  let newLabel;

  if (baseFolder !== null) {
    root = path.resolve(cwd, directory ?? ".");
    const baseRoot = path.resolve(cwd, baseFolder);
    let baseAll;
    let newAll;
    try {
      [baseAll, newAll] = await Promise.all([readFolder(baseRoot), readFolder(root)]);
    } catch {
      throw new SkillAuthorError("unreadable-folder", "The base folder and the compared folder must be readable", 2);
    }
    const prefixes = paths ? relativePaths(root, cwd, paths) : null;
    const select = (keys) => selectFiles(keys, prefixes, (file) => baseAll.get(file) !== newAll.get(file));
    const fromBase = select(baseAll.keys()).base;
    const fromNew = select(newAll.keys()).search;
    baseTree = new Map([...baseAll].filter(([file]) => fromBase(file)));
    baseListed = new Set(baseAll.keys());
    searchTree = new Map([...newAll].filter(([file]) => fromNew(file)));
    if (deletedOnly) removed = folderRemovedLines(baseTree, newAll);
    baseLabel = baseRoot;
    baseFrom = "folder";
    newLabel = root;
    paths = prefixes;
  } else {
    root = git(cwd, ["rev-parse", "--show-toplevel"]).trim();
    const prefixes = paths ? relativePaths(root, cwd, paths) : null;
    if (base === null) {
      ({ ref: base, from: baseFrom } = defaultBase(root));
    } else {
      baseFrom = "argument";
    }
    for (const ref of [base, next])
      if (ref !== null) git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    const changed = changedFiles(root, base, next);
    const baseSide = await readSide(
      root,
      base,
      (files) => selectFiles(files, prefixes, (file) => changed.has(file)).base,
    );
    baseTree = baseSide.tree;
    baseListed = baseSide.listed;
    searchTree = (await readSide(root, next, (files) => selectFiles(files, prefixes, () => true).search)).tree;
    if (deletedOnly) removed = removedLines(root, base, next, [...baseTree.keys()]);
    baseLabel = base;
    newLabel = next ?? WORKING_TREE;
    paths = prefixes;
  }
  const judged = verdicts ? await readVerdicts(path.resolve(cwd, verdicts)) : new Map();

  const index = buildIndex(searchTree);
  const units = [];
  for (const [file, contents] of baseTree) {
    const seen = new Map();
    for (const unit of splitUnits(file, contents)) {
      if (tokens(unit.text).length === 0) continue;
      const occurrence = (seen.get(unit.line) ?? 0) + 1;
      seen.set(unit.line, occurrence);
      const key = occurrence === 1 ? `${file}:${unit.line}` : `${file}:${unit.line}#${occurrence}`;
      if (removed) {
        const lines = removed.get(file);
        let touched = false;
        for (let line = unit.line; lines && line <= unit.endLine && !touched; line += 1) touched = lines.has(line);
        if (!touched) continue;
      }
      units.push({ key, ...unit, ruleLike: isRuleLike(unit), match: matchUnit(unit, index) });
    }
  }

  const tally = (selected) => {
    const counts = { units: selected.length };
    for (const name of CLASSES) counts[name] = selected.filter((unit) => unit.match.class === name).length;
    return counts;
  };
  const detail = (unit) => ({
    key: unit.key,
    kind: unit.kind,
    heading: unit.headings.filter(Boolean).at(-1) ?? null,
    text: unit.text,
    containment: unit.match.containment,
    jaccard: unit.match.jaccard,
  });
  const ruleLikeUnmatched = units
    .filter((unit) => unit.ruleLike && unit.match.class === "unmatched")
    .map((unit) => ({ ...detail(unit), verdict: judged.get(unit.key) ?? null }));
  const ruleLikeReworded = units.filter((unit) => unit.ruleLike && unit.match.class === "reworded").map(detail);
  const unresolved = ruleLikeUnmatched.filter((unit) => unit.verdict === null).map((unit) => unit.key);
  const used = new Set(ruleLikeUnmatched.map((unit) => unit.key));

  return {
    command: "compare",
    status: unresolved.length ? "unresolved" : "ok",
    root,
    base: baseLabel,
    baseFrom,
    new: newLabel,
    paths,
    deletedOnly,
    files: {
      compared: baseTree.size,
      searched: searchTree.size,
      removed: [...baseTree.keys()].filter((file) => !searchTree.has(file)),
      added: [...searchTree.keys()].filter((file) => !baseListed.has(file) && (!paths || underPaths(paths)(file))),
    },
    counts: { all: tally(units), ruleLike: tally(units.filter((unit) => unit.ruleLike)) },
    ruleLikeUnmatched,
    ruleLikeReworded,
    unresolved,
    unusedVerdicts: [...judged.keys()].filter((key) => !used.has(key)),
  };
}

const short = (ref) => (/^[0-9a-f]{40}$/i.test(ref) ? ref.slice(0, 8) : ref);
const at = (score) => (score?.file ? `${score.score} at ${score.file}:${score.line ?? "?"}` : "0");

export function compareMarkdown(result) {
  const lines = [`# Loss check: ${short(result.base)} -> ${short(result.new)}`, ""];
  if (result.baseFrom !== "argument" && result.baseFrom !== "folder") lines.push(`Base: the ${result.baseFrom}.`, "");
  lines.push(
    `Compared ${result.files.compared} files (${result.paths ? result.paths.join(", ") : "default model-facing set"})${result.deletedOnly ? ", lines the diff removes or changes only" : ""}; searched ${result.files.searched}.`,
  );
  if (result.files.removed.length) lines.push(`Removed: ${result.files.removed.join(", ")}.`);
  if (result.files.added.length) lines.push(`Added: ${result.files.added.join(", ")}.`);
  lines.push("", `| units | ${CLASSES.join(" | ")} |`, `| --- | ${CLASSES.map(() => "---").join(" | ")} |`);
  for (const [name, counts] of Object.entries(result.counts)) {
    lines.push(
      `| ${name === "all" ? "all" : "rule-like"}: ${counts.units} | ${CLASSES.map((cls) => counts[cls]).join(" | ")} |`,
    );
  }
  lines.push(
    "",
    `## Rule-like unmatched (${result.ruleLikeUnmatched.length}, ${result.unresolved.length} without a verdict)`,
    "",
  );
  for (const unit of result.ruleLikeUnmatched) {
    lines.push(`- \`${unit.key}\` ${unit.text}`);
    lines.push(`  - containment ${at(unit.containment)}; Jaccard ${at(unit.jaccard)}`);
    lines.push(`  - verdict: ${unit.verdict ?? "NONE"}`);
  }
  if (!result.ruleLikeUnmatched.length) lines.push("None.");
  lines.push("", `## Rule-like reworded: confirm the meaning survived (${result.ruleLikeReworded.length})`, "");
  for (const unit of result.ruleLikeReworded) {
    lines.push(`- \`${unit.key}\` ${unit.text}`);
    const best = unit.containment.score >= unit.jaccard.score ? unit.containment : unit.jaccard;
    lines.push(`  - closest (${at(best)}): ${best.text ?? ""}`);
  }
  if (!result.ruleLikeReworded.length) lines.push("None.");
  if (result.unusedVerdicts.length) lines.push("", `Verdicts no longer needed: ${result.unusedVerdicts.join(", ")}.`);
  lines.push("", `Status: ${result.status}.`);
  return `${lines.join("\n")}\n`;
}
