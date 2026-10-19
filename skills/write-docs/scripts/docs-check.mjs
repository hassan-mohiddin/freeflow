#!/usr/bin/env node
// Checks documentation written with the Write Docs shapes (references/documentation-shapes.md):
//   - every repository path a document names in backticks exists;
//   - for a document whose header has Covers and Verified at, lists covered files changed since that commit
//     (committed or not), so a reader knows which documents may be stale.
// With --covering, it instead lists the documents whose Covers include each given repository path (that file, or a
// covered directory holding it), with their Verified at and whether they are stale, and how many searched documents
// have no Covers line. Without document arguments it searches the project's docs index: the first of `dev-docs/`
// (holding README.md), `ARCHITECTURE.md`, and `docs/` (holding README.md).
// Usage: docs-check.mjs <file-or-directory>... [--root <repository>] [--strict] [--json]
//        docs-check.mjs [<file-or-directory>...] --covering <path> [--covering <path>]... [--root <repository>] [--json]
// Exit code 1 when a named path is missing, a header is invalid, or (with --strict) covered code changed. A --covering
// lookup reports and exits 0, or 2 when no documents can be found.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string" },
    strict: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    covering: { type: "string", multiple: true },
  },
});
const usage = () => {
  console.error(
    "Usage: docs-check.mjs <file-or-directory>... [--root <repository>] [--strict] [--json]\n" +
      "       docs-check.mjs [<file-or-directory>...] --covering <path> [--covering <path>]... [--root <repository>] [--json]",
  );
  process.exit(2);
};
if (!positionals.length && !values.covering) usage();

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const root = resolve(
  values.root ??
    (() => {
      try {
        return git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
      } catch {
        return process.cwd();
      }
    })(),
);

function markdownFiles(path) {
  const full = resolve(path);
  if (!existsSync(full)) return [{ missingInput: full }];
  if (statSync(full).isFile()) return full.endsWith(".md") ? [full] : [];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
    entry.name.startsWith(".") || entry.name === "node_modules" ? [] : markdownFiles(join(full, entry.name)),
  );
}

const HEADER = /^>\s*\*\*(Covers|Tests|Verified at|User docs):\*\*\s*(.*)$/;
const ticks = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
// A repository path: segments joined by "/", no spaces, no URL scheme, no placeholders or globs.
const PATH = /^[A-Za-z0-9_.@-]+(\/[A-Za-z0-9_.@-]+)*\/?$/;
const looksLikePath = (token) => PATH.test(token) && token.includes("/") && !token.includes("://");
// The header names paths on purpose, so a root-level file (`command-surface.json`) counts there too.
const headerPath = (token) => looksLikePath(token) || (PATH.test(token) && /^[^/]+\.[A-Za-z0-9]+$/.test(token));
// A named path outside a header counts only when its first segment exists in the repository and is not hidden or
// relative, so commands, examples, other tools' conventions (`.claude/skills/`), and import spellings (`./x.js`)
// are not mistaken for this repository's files.
const repoPath = (token) => !token.startsWith(".") && existsSync(join(root, token.split("/")[0]));

function check(file) {
  const text = readFileSync(file, "utf8");
  const header = {};
  for (const line of text.split("\n").slice(0, 30)) {
    const match = HEADER.exec(line);
    if (match) header[match[1]] = match[2];
  }
  const errors = [];
  const named = new Set();
  for (const key of ["Covers", "Tests", "User docs"])
    for (const token of header[key] ? ticks(header[key]) : [])
      if (headerPath(token)) named.add(token);
      else errors.push(`${key} names something that is not a repository path: ${token}`);
  // Body paths outside fenced code blocks: code blocks hold commands and examples, not claims about this repository.
  const prose = text.replace(/^```[\s\S]*?^```/gm, "");
  for (const token of ticks(prose)) if (looksLikePath(token) && repoPath(token)) named.add(token);
  // A path resolves from the repository root or, as a link would, from the document's own directory.
  const exists = (path) => [root, dirname(file)].some((base) => existsSync(join(base, path.replace(/\/$/, ""))));
  const missing = [...named].filter((path) => !exists(path));

  let stale;
  if (header["Verified at"] !== undefined) {
    const commit = ticks(header["Verified at"])[0];
    const covers = header.Covers ? ticks(header.Covers).filter(headerPath) : [];
    if (!commit) errors.push("Verified at names no commit in backticks");
    else if (!covers.length) errors.push("Verified at needs a Covers line naming the code it was verified against");
    else {
      try {
        git(root, ["cat-file", "-e", `${commit}^{commit}`]);
        const lines = (args) => git(root, args).split("\n").filter(Boolean);
        // A change made together with the document (same commit, or both uncommitted) was reviewed with it.
        const self = relative(root, file);
        const withDoc = new Set(lines(["log", "--format=%H", `${commit}..HEAD`, "--", self]));
        const docDirty = lines(["status", "--porcelain", "--", self]).length > 0;
        const changed = lines(["diff", "--name-only", commit, "--", ...covers]).filter(
          (path) =>
            lines(["log", "--format=%H", `${commit}..HEAD`, "--", path]).some((each) => !withDoc.has(each)) ||
            (!docDirty && lines(["status", "--porcelain", "--", path]).length > 0),
        );
        stale = { since: commit, changed };
      } catch {
        errors.push(`Verified at names a commit this repository does not have: ${commit}`);
      }
    }
  }
  const covers = header.Covers ? ticks(header.Covers).filter(headerPath) : [];
  const verifiedAt = header["Verified at"] !== undefined ? (ticks(header["Verified at"])[0] ?? null) : null;
  return { path: relative(root, file), header: Object.keys(header), covers, verifiedAt, missing, stale, errors };
}

// The project's docs index, in the order Write Docs' "Starting Developer Docs" names.
function docsIndex() {
  if (existsSync(join(root, "dev-docs/README.md"))) return join(root, "dev-docs");
  if (existsSync(join(root, "ARCHITECTURE.md"))) return join(root, "ARCHITECTURE.md");
  if (existsSync(join(root, "docs", "README.md"))) return join(root, "docs");
  return null;
}

// A covered entry includes a path when it names that path, or names a directory holding it.
const includes = (covered, path) => {
  const entry = covered.replace(/\/$/, "");
  return path === entry || path.startsWith(`${entry}/`);
};

function covering(paths) {
  const inputs = positionals.length ? positionals.map((input) => resolve(input)) : [docsIndex()].filter(Boolean);
  if (!inputs.length) {
    console.error(
      "docs-check: no developer docs found (dev-docs/README.md, ARCHITECTURE.md, a README.md in docs/); pass the docs to search",
    );
    process.exit(2);
  }
  const documents = inputs
    .flatMap(markdownFiles)
    .filter((file) => typeof file === "string")
    .map(check);
  const queries = paths.map((path) => relative(root, resolve(root, path)).replace(/\/$/, ""));
  const results = queries.map((path) => ({
    path,
    documents: documents
      .filter((doc) => doc.covers.some((covered) => includes(covered, path)))
      .map((doc) => ({
        path: doc.path,
        verifiedAt: doc.verifiedAt,
        state: doc.stale === undefined ? "unverified" : doc.stale.changed.length ? "stale" : "current",
        changed: doc.stale?.changed ?? [],
      })),
  }));
  const withoutCovers = documents.filter((doc) => !doc.covers.length).map((doc) => doc.path);
  if (values.json)
    console.log(
      JSON.stringify(
        {
          command: "docs-check",
          mode: "covering",
          root,
          searched: inputs.map((input) => relative(root, input) || "."),
          documents: documents.length,
          withoutCovers,
          paths: results,
        },
        null,
        2,
      ),
    );
  else {
    for (const result of results) {
      console.log(result.path);
      if (!result.documents.length) console.log("  no covering document");
      for (const doc of result.documents) {
        const changed = doc.changed.length ? `, ${doc.changed.length} covered file(s) changed since` : "";
        console.log(`  ${doc.path} (verified at ${doc.verifiedAt ?? "none"}: ${doc.state}${changed})`);
      }
    }
    console.log(
      `${documents.length} documents searched; ${withoutCovers.length} have no Covers line, so no lookup can find them.`,
    );
  }
  process.exit(0);
}

if (values.covering) covering(values.covering);

const documents = [];
const inputErrors = [];
for (const input of positionals)
  for (const file of markdownFiles(input))
    if (typeof file === "object") inputErrors.push(`no such file or directory: ${file.missingInput}`);
    else documents.push(check(file));

const failed =
  inputErrors.length > 0 ||
  documents.some((doc) => doc.missing.length || doc.errors.length || (values.strict && doc.stale?.changed.length));
if (values.json)
  console.log(
    JSON.stringify({ command: "docs-check", root, status: failed ? "fail" : "pass", inputErrors, documents }, null, 2),
  );
else {
  for (const error of inputErrors) console.log(`error: ${error}`);
  for (const doc of documents) {
    const lines = [
      ...doc.errors.map((error) => `  error: ${error}`),
      ...doc.missing.map((path) => `  missing: ${path}`),
      ...(doc.stale?.changed.length
        ? [`  ${values.strict ? "error" : "warning"}: covered code changed since ${doc.stale.since}:`]
        : []),
      ...(doc.stale?.changed ?? []).map((path) => `    ${path}`),
    ];
    if (lines.length) console.log(`${doc.path}\n${lines.join("\n")}`);
  }
  const stale = documents.filter((doc) => doc.stale?.changed.length).length;
  console.log(
    `${documents.length} documents checked: ${documents.filter((doc) => doc.missing.length || doc.errors.length).length} with errors, ${stale} with covered code changed since verified.`,
  );
}
process.exit(failed ? 1 : 0);
