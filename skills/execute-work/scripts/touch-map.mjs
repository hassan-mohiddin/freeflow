#!/usr/bin/env node
// Answers "what does this change touch?" with capped, labelled query results, so the consequences of a change are in
// front of the agent before its first edit: entry points, readers of the state, writers (where old data comes from),
// scheduled or concurrent code, the tests that cover it, and the developer docs that cover each touched file. Each
// block gives its count, the first results, and what it did not search. It is a query, not a verdict: the agent writes
// a decision next to each result (Working Method, "Find what the change touches").
// Usage: touch-map.mjs (--symbol <name> | --file <path>)... [--root <repository>] [--cap <n>] [--json]
// Searches files Git tracks and untracked files it does not ignore. Developer docs come from Write Docs'
// docs-check.mjs --covering; when no document has a Covers line, a capped search of the docs folder stands in.
// Exit code 0 when it reports (even nothing), 2 on a usage or Git error.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const USAGE = "Usage: touch-map.mjs (--symbol <name> | --file <path>)... [--root <repository>] [--cap <n>] [--json]";
const DOCS_CHECK = resolve(dirname(fileURLToPath(import.meta.url)), "../../write-docs/scripts/docs-check.mjs");

function fail(message) {
  console.error(message);
  process.exit(2);
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      symbol: { type: "string", multiple: true, default: [] },
      file: { type: "string", multiple: true, default: [] },
      root: { type: "string" },
      cap: { type: "string", default: "20" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
if (!values.symbol.length && !values.file.length) fail(USAGE);
const cap = Number(values.cap);
if (!Number.isInteger(cap) || cap < 1) fail(`--cap must be a positive whole number\n${USAGE}`);

const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
let root;
try {
  root = resolve(git(resolve(values.root ?? "."), ["rev-parse", "--show-toplevel"]).trim());
} catch {
  fail("not inside a Git repository");
}

// Test files by the common layouts Verify Work's test-changes.mjs lists; enough to tell a test hit from a code hit.
const TEST_PATH =
  /(^|\/)(tests?|__tests__|spec|e2e|Tests)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|dart|exs)$|(^|\/)test_[^/]*\.py$|_spec\.rb$|(Test|Tests)\.(java|kt|cs|swift|php)$/;
const DOC_PATH = /\.(md|mdx|rst|adoc|txt)$/i;
const isTest = (path) => TEST_PATH.test(path);
const isDoc = (path) => DOC_PATH.test(path);

// Fixed-string git grep over tracked and untracked (not ignored) files; returns [{ path, line, text }]. Callers refine
// with JavaScript expressions, which behave the same on every platform's Git.
function grep(text, { word = false, paths = [] } = {}) {
  const args = ["grep", "-n", "-I", "-F", "--no-color", "--untracked", "-e", text];
  if (word) args.splice(1, 0, "-w");
  if (paths.length) args.push("--", ...paths);
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0 && result.status !== 1) fail(`git grep failed: ${result.stderr.trim()}`);
  return (result.stdout ?? "")
    .split("\n")
    .filter(Boolean)
    .map((raw) => {
      const match = /^(.*?):(\d+):(.*)$/.exec(raw);
      return match ? { path: match[1], line: Number(match[2]), text: match[3].trim().slice(0, 200) } : null;
    })
    .filter(Boolean);
}

const block = (label, hits, notSearched) => ({
  label,
  count: hits.length,
  results: hits.slice(0, cap).map((hit) => `${hit.path}:${hit.line}: ${hit.text}`),
  cut: Math.max(0, hits.length - cap),
  notSearched,
});
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Explicit scheduling and concurrency primitives, not every async function, so the block stays readable.
const SCHEDULED =
  /\b(setTimeout|setInterval|setImmediate|queueMicrotask|requestAnimationFrame|cron|schedule(r|d)?\s*\(|new Worker|worker_threads|Promise\.(all|allSettled|race|any)|go func|goroutine|threading\.|Thread\(|asyncio\.(gather|create_task|wait)|concurrent\.futures|ThreadPool|ExecutorService|tokio::spawn|spawn\(|[Mm]utex|[Ss]emaphore|\.lock\(|withLock|debounce|throttle|retry\(|\.on\(\s*['"`]|addEventListener|setImmediate)/;

// Lines in the given files that schedule work or run it concurrently.
function scheduledIn(files) {
  const hits = [];
  for (const path of files) {
    let text;
    try {
      text = readFileSync(join(root, path), "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((line, index) => {
      if (SCHEDULED.test(line)) hits.push({ path, line: index + 1, text: line.trim().slice(0, 200) });
    });
  }
  return hits;
}

function symbolMap(symbol) {
  const pattern = escape(symbol);
  const hits = grep(symbol, { word: true }).filter((hit) => !isDoc(hit.path));
  const definition = new RegExp(
    `\\b(function\\*?|class|def|const|let|var|interface|type|enum|struct|trait|func|fn|module|export\\s+(default\\s+)?)\\s+${pattern}\\b|^\\s*(async\\s+)?${pattern}\\s*\\([^)]*\\)\\s*\\{`,
  );
  const write = new RegExp(
    `(\\b|\\.)${pattern}\\s*(\\+\\+|--|[-+*/|&]?=(?!=))|\\b(set|write|save|store|put|insert|update|upsert|persist|delete|remove|assign)\\w*\\s*\\(\\s*['"\`]?${pattern}\\b|\\b${pattern}\\b\\s*:(?!:)|\\b(INSERT|UPDATE|DELETE)\\b.*\\b${pattern}\\b`,
    "i",
  );
  const call = new RegExp(`\\b${pattern}\\s*\\(|\\bnew\\s+${pattern}\\b|['"\`/]${pattern}['"\`]`);
  const code = hits.filter((hit) => !isTest(hit.path));
  const definitions = code.filter((hit) => definition.test(hit.text));
  const writers = code.filter((hit) => !definition.test(hit.text) && write.test(hit.text));
  const entry = code.filter((hit) => !definition.test(hit.text) && !writers.includes(hit) && call.test(hit.text));
  const readers = code.filter((hit) => !definitions.includes(hit) && !writers.includes(hit) && !entry.includes(hit));
  const files = [...new Set(code.map((hit) => hit.path))];
  const scheduled = scheduledIn(files.filter((path) => !isTest(path)));
  const tests = hits.filter((hit) => isTest(hit.path));
  const defined = [...new Set(definitions.map((hit) => hit.path))];
  return {
    target: symbol,
    kind: "symbol",
    definedIn: definitions.slice(0, cap).map((hit) => `${hit.path}:${hit.line}`),
    blocks: [
      block("entry points (calls, constructions, string references)", entry, [
        "names built at run time, reflection and dynamic dispatch",
        "other repositories, generated or ignored files",
      ]),
      block("readers of the state", readers, ["aliases and destructured or renamed copies", "serialized forms"]),
      block("writers (where old data comes from)", writers, [
        "data already stored by earlier versions: databases, files, caches, user settings",
        "writes through an alias or a generic setter",
      ]),
      block("scheduled or concurrent code in the files that use it", scheduled, [
        "callers in other files that run it concurrently",
        "external schedulers (cron tables, CI, hosts)",
      ]),
      block("covering tests", tests, ["tests that reach it only indirectly", "test files outside the common layouts"]),
    ],
    touchedFiles: defined,
  };
}

function fileMap(input) {
  const path = relative(root, resolve(input)).split("\\").join("/");
  if (path.startsWith("..")) fail(`outside the repository: ${input}`);
  const stem = basename(path, extname(path));
  const name = basename(path);
  // Importers and other references: lines naming the file by its path or its stem in an import-like statement.
  const named = new RegExp(`(^|[^A-Za-z0-9_.-])${escape(stem)}(\\.[A-Za-z0-9]+)?(['"\`)\\s:,;]|$)`);
  const references = grep(stem).filter((hit) => hit.path !== path && !isDoc(hit.path) && named.test(hit.text));
  const imports = references.filter((hit) =>
    /\b(import|require|from|include|source|load|use|mod)\b|\bnode\b|\bpython\b|"(bin|main|exports|scripts)"/.test(
      hit.text,
    ),
  );
  const other = references.filter((hit) => !imports.includes(hit) && !isTest(hit.path));
  const exists = existsSync(join(root, path));
  const scheduled = exists ? scheduledIn([path]) : [];
  const tests = references.filter((hit) => isTest(hit.path));
  return {
    target: path,
    kind: "file",
    exists,
    blocks: [
      block(
        "entry points (importers, commands, manifests)",
        imports.filter((hit) => !isTest(hit.path)),
        ["dynamic imports with built paths", "registration by convention (routes, plugins found by folder)"],
      ),
      block("other references by name", other, [`mentions spelled other than ${name} or ${stem}`]),
      block("scheduled or concurrent code in the file", scheduled, ["callers that run it concurrently"]),
      block("covering tests", tests, ["tests that reach it only through other modules"]),
    ],
    touchedFiles: [path],
  };
}

const maps = [...values.symbol.map(symbolMap), ...values.file.map(fileMap)];

// Developer docs covering every touched file, from docs-check --covering; a capped docs search when no doc has Covers.
const touched = [...new Set(maps.flatMap((map) => map.touchedFiles))];
let docs = { source: "none", paths: [], notSearched: [] };
if (touched.length && existsSync(DOCS_CHECK)) {
  const run = spawnSync(
    process.execPath,
    [DOCS_CHECK, ...touched.flatMap((path) => ["--covering", path]), "--root", root, "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (run.status === 0) {
    const found = JSON.parse(run.stdout);
    const withCovers = found.documents - found.withoutCovers.length;
    // Title and one line: the doc's first heading, and the section and line that name the file.
    const describe = (docPath, target) => {
      let text = "";
      try {
        text = readFileSync(join(root, docPath), "utf8");
      } catch {
        return { heading: null, line: null };
      }
      const lines = text.split("\n");
      const title = lines.find((line) => /^#\s/.test(line))?.replace(/^#\s+/, "") ?? null;
      const index = lines.findIndex((line, at) => at > 6 && (line.includes(target) || line.includes(basename(target))));
      let section = title;
      for (let at = index; at >= 0; at -= 1)
        if (/^#{2,4}\s/.test(lines[at])) {
          section = lines[at].replace(/^#+\s+/, "");
          break;
        }
      const first =
        index >= 0
          ? lines[index]
          : (lines.find((line, at) => at > 0 && line.trim() && !/^[#>]/.test(line.trim())) ?? "");
      return { heading: section, line: first.trim().slice(0, 200) };
    };
    if (withCovers > 0)
      docs = {
        source: "docs-check --covering",
        searched: found.searched,
        paths: found.paths.map((entry) => ({
          path: entry.path,
          documents: entry.documents.map((doc) => ({
            path: doc.path,
            ...describe(doc.path, entry.path),
            verifiedAt: doc.verifiedAt,
            state: doc.state,
            changedSince: doc.changed.length,
          })),
        })),
        notSearched: [
          `${found.withoutCovers.length} of ${found.documents} documents have no Covers line, so no lookup finds them`,
          "user docs and READMEs outside the docs index",
        ],
      };
    else {
      const folder = found.searched[0] ?? "";
      docs = {
        source: `capped search of ${folder || "the docs folder"} (no document has a Covers line)`,
        searched: found.searched,
        paths: touched.map((path) => {
          const hits = grep(basename(path), { paths: folder ? [folder] : [] }).filter((hit) => isDoc(hit.path));
          return {
            path,
            documents: hits
              .slice(0, cap)
              .map((hit) => ({ path: hit.path, heading: null, line: `${hit.line}: ${hit.text}` })),
            cut: Math.max(0, hits.length - cap),
          };
        }),
        notSearched: ["docs that describe the code without naming the file", "staleness: no Verified at to compare"],
      };
    }
  } else
    docs = {
      source: "unavailable",
      paths: [],
      notSearched: [`docs-check: ${(run.stderr || run.stdout).trim().split("\n")[0]}`],
    };
}

const report = { command: "touch-map", root, cap, maps, docs };
if (values.json) console.log(JSON.stringify(report, null, 2));
else {
  for (const map of maps) {
    console.log(`=== ${map.kind} ${map.target}${map.kind === "file" && !map.exists ? " (does not exist yet)" : ""}`);
    if (map.definedIn) console.log(`defined at: ${map.definedIn.join(", ") || "no definition found"}`);
    for (const each of map.blocks) {
      console.log(`--- ${each.label}: ${each.count}${each.cut ? ` (first ${cap} shown)` : ""}`);
      for (const result of each.results) console.log(`  ${result}`);
      console.log(`  not searched: ${each.notSearched.join("; ")}`);
    }
  }
  console.log(`--- developer docs (${docs.source})`);
  for (const entry of docs.paths) {
    console.log(`  ${entry.path}`);
    if (!entry.documents.length) console.log("    no covering document");
    for (const doc of entry.documents)
      console.log(
        `    ${doc.path}${doc.heading ? ` § ${doc.heading}` : ""}${doc.state ? ` (verified at ${doc.verifiedAt ?? "none"}: ${doc.state}${doc.changedSince ? `, ${doc.changedSince} covered file(s) changed since` : ""})` : ""}${doc.line ? `\n      ${doc.line}` : ""}`,
      );
  }
  if (docs.notSearched.length) console.log(`  not searched: ${docs.notSearched.join("; ")}`);
  console.log("Write your decision next to each result: it changes too, or its users keep exactly what they get now.");
}
