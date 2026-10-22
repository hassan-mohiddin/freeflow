#!/usr/bin/env node
// Checks the header, status and source trail of Specs, Plans and decision records (Write Docs, "Header, Status And
// Sources"): a title; one status from the vocabulary (Draft, Reviewed, Accepted, Rejected, Superseded, Retired) or the
// repository's own, given with --statuses; an Accepted document names its Source; a Superseded one links its
// replacement; and every typed pointer in the trail resolves: file:<path>, commit:<sha>, working-record:<task>/...
// It checks shape and pointers, not whether the source really accepted the document.
// Usage: artifact-check.mjs <document.md>... [--statuses <a,b,...>] [--root <repository>] [--json]
// The status is read from a "> **Status:** ..." header line or the first line under a "## Status" heading. Exit code
// 0 when every document passes, 1 when one has a problem, 2 on a usage error.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const USAGE = "Usage: artifact-check.mjs <document.md>... [--statuses <a,b,...>] [--root <repository>] [--json]";
let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { statuses: { type: "string" }, root: { type: "string" }, json: { type: "boolean", default: false } },
  });
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}
const { values, positionals } = parsed;
if (!positionals.length) {
  console.error(USAGE);
  process.exit(2);
}
const git = (cwd, args) => {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const root = resolve(values.root ?? git(process.cwd(), ["rev-parse", "--show-toplevel"]) ?? process.cwd());
const STATUSES = values.statuses
  ? values.statuses
      .split(",")
      .map((each) => each.trim())
      .filter(Boolean)
  : ["Draft", "Reviewed", "Accepted", "Rejected", "Superseded", "Retired"];

function check(file) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const header = {};
  for (const line of lines.slice(0, 40)) {
    const match = /^>\s*\*\*([A-Za-z][A-Za-z ]*?):\*\*\s*(.*)$/.exec(line);
    if (match && !(match[1] in header)) header[match[1]] = match[2].trim();
  }
  const problems = [];
  const notChecked = [];
  const title = lines.find((line) => /^#\s+\S/.test(line))?.replace(/^#\s+/, "") ?? null;
  if (!title) problems.push("has no title (a first-level heading)");

  let status = header.Status ?? null;
  if (status === null) {
    const at = lines.findIndex((line) => /^##\s+Status\s*$/i.test(line));
    if (at !== -1)
      status =
        lines
          .slice(at + 1)
          .find((line) => line.trim())
          ?.trim() ?? null;
  }
  const value = status?.replace(/[.*`]/g, "").split(/[\s,;(—–]/)[0] ?? null;
  if (!status) problems.push("has no status (a > **Status:** line or a ## Status section)");
  else if (status.includes("|")) problems.push(`gives several statuses (${status}); give the one current status`);
  else if (!STATUSES.includes(value))
    problems.push(
      `status "${value}" is not one of ${STATUSES.join(", ")}${values.statuses ? "" : " (pass --statuses for the repository's own)"}`,
    );

  const body = text.toLowerCase();
  if (
    value === "Accepted" &&
    !header.Source &&
    !/^#{2,3}\s+(sources?|source trail)\b/im.test(text) &&
    !/\b(accepted by|accepted in|accepted on)\b/.test(body)
  )
    problems.push("is Accepted but names no Source for the acceptance");
  if (value === "Superseded" && !header["Superseded by"] && !/superseded by/i.test(text))
    problems.push("is Superseded but does not link its replacement (Superseded by)");
  if (value === "Retired" && !/\b\d{4}-\d{2}-\d{2}\b/.test(status + (header.Date ?? "") + text))
    problems.push("is Retired without a date");

  // Typed pointers anywhere in the document: the source trail.
  // Placeholders (<sha>) and prose such as "file:line" are not pointers.
  const pointers = [...text.matchAll(/\b(file|commit|working-record):([^\s`)\],;]+)/g)]
    .map((match) => ({ kind: match[1], value: match[2].replace(/[.]+$/, "") }))
    .filter(
      (pointer) =>
        !pointer.value.startsWith("<") &&
        (pointer.kind !== "file" || /[./]/.test(pointer.value)) &&
        (pointer.kind !== "commit" || /^[0-9a-f]{7,40}$/i.test(pointer.value)),
    );
  for (const pointer of pointers) {
    const path = pointer.value.replace(/#.*$/, "");
    if (pointer.kind === "commit") {
      if (!/^[0-9a-f]{4,40}$/i.test(path) || !git(root, ["rev-parse", "--verify", "--quiet", `${path}^{commit}`]))
        problems.push(`commit:${path} does not resolve in ${root}`);
    } else if (pointer.kind === "file") {
      if (![root, dirname(file)].some((base) => existsSync(join(base, path))))
        problems.push(`file:${path} does not exist`);
    } else {
      const candidates = [join(root, ".freeflow", "tasks", path), join(root, ".freeflow", "project", path)];
      if (!candidates.some((candidate) => existsSync(candidate)))
        notChecked.push(`working-record:${path} (not found under .freeflow/tasks or the linked project)`);
    }
  }
  if (!pointers.length && !header.Source)
    notChecked.push("no typed source pointers (file:, commit:, working-record:) to check");
  return {
    path: relative(root, file) || file,
    title,
    status: value,
    header: Object.keys(header),
    problems,
    notChecked,
  };
}

const results = [];
const inputErrors = [];
for (const input of positionals) {
  const file = resolve(input);
  if (!existsSync(file)) inputErrors.push(`no such file: ${input}`);
  else results.push(check(file));
}
const failed = inputErrors.length > 0 || results.some((result) => result.problems.length);
if (values.json)
  console.log(
    JSON.stringify({ command: "artifact-check", status: failed ? "fail" : "pass", inputErrors, results }, null, 2),
  );
else {
  for (const error of inputErrors) console.log(`error: ${error}`);
  for (const result of results) {
    console.log(
      `${result.path}: ${result.status ?? "no status"}${result.problems.length ? `, ${result.problems.length} problem(s)` : ", passes"}`,
    );
    for (const problem of result.problems) console.log(`  problem: ${problem}`);
    for (const note of result.notChecked) console.log(`  not checked: ${note}`);
  }
}
process.exit(failed ? 1 : 0);
