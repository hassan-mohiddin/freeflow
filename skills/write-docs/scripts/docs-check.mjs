#!/usr/bin/env node
// Checks documentation written with the Write Docs shapes (references/documentation-shapes.md):
//   - every repository path a document names in backticks exists;
//   - for a document whose header has Covers and Verified at, lists covered files changed since that commit
//     (committed or not), so a reader knows which documents may be stale.
// Usage: docs-check.mjs <file-or-directory>... [--root <repository>] [--strict] [--json]
// Exit code 1 when a named path is missing, a header is invalid, or (with --strict) covered code changed.
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
  },
});
if (!positionals.length) {
  console.error("Usage: docs-check.mjs <file-or-directory>... [--root <repository>] [--strict] [--json]");
  process.exit(2);
}

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
  return { path: relative(root, file), header: Object.keys(header), missing, stale, errors };
}

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
