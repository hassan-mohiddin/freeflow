#!/usr/bin/env node
// Puts the facts a self-review needs in one scratch report, so the agent reads its actual change rather than its
// memory of it: Git status, the diff stat against a base, every changed existing test, fixture, snapshot or shared
// test setup with its hunk (Verify Work's test-changes.mjs), each new test and whether it fails on the base, added lines
// that look like leftover debug output, and per requirement the last recorded check and whether it ran after the last
// edit. It lists; judging each item is the agent's and the user's.
//
// A check is recorded with `check`, which runs it and stamps it with the state it ran on: HEAD plus a hash of every
// uncommitted change, untracked files included. A requirement's check "ran after the last edit" when its stamp equals
// the current state's.
//
// Usage: self-review.mjs --base <ref> [--root <repository>] [--requirements <file>] [--test-command <command>]
//                        [--scratch <dir>] [--json]
//        self-review.mjs check --id <R1> [--root <repository>] [--scratch <dir>] (--command <shell command> | -- <argv>)
// --requirements: a file whose lines start with a requirement ID (R1, - R2, ...), optionally ending in
// "check: <command>". --test-command runs each new test on the base in a temporary worktree; "{file}" in it is replaced
// by the test's path, otherwise the path is appended. --scratch defaults to a folder under the system temporary
// directory; pass the task's scratch/ when it has a Working Record. Exit code 0 when the report is written, 2 on a
// usage or Git error; `check` exits with the command's exit code.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, appendFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const USAGE = [
  "Usage: self-review.mjs --base <ref> [--root <repository>] [--requirements <file>] [--test-command <command>] [--scratch <dir>] [--json]",
  "       self-review.mjs check --id <R1> [--root <repository>] [--scratch <dir>] (--command <shell command> | -- <argv>)",
].join("\n");
const TEST_CHANGES = resolve(dirname(fileURLToPath(import.meta.url)), "../../verify-work/scripts/test-changes.mjs");
const CAP = 40;
const LEFTOVER =
  /\b(console\.(log|debug|trace)|debugger|print\(|println!|dbg!|fmt\.Print|var_dump|binding\.pry|breakpoint\(\)|pdb\.set_trace)|\b(TODO|FIXME|XXX)\b/;

function fail(message) {
  console.error(message);
  process.exit(2);
}

const argv = process.argv.slice(2);
const mode = argv[0] === "check" ? "check" : "report";
const dash = argv.indexOf("--");
const own = mode === "check" ? argv.slice(1, dash === -1 ? undefined : dash) : argv;
let values;
try {
  ({ values } = parseArgs({
    args: own,
    options: {
      base: { type: "string" },
      root: { type: "string" },
      requirements: { type: "string" },
      "test-command": { type: "string" },
      scratch: { type: "string" },
      id: { type: "string" },
      command: { type: "string" },
      json: { type: "boolean", default: false },
    },
  }));
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}

const git = (cwd, args, options = {}) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
const gitOrFail = (cwd, args, what) => {
  try {
    return git(cwd, args);
  } catch (error) {
    fail(`${what}: ${String(error.stderr || error.message).trim()}`);
  }
};

const root = resolve(
  gitOrFail(resolve(values.root ?? "."), ["rev-parse", "--show-toplevel"], "not inside a Git repository").trim(),
);
const scratch = resolve(
  values.scratch ??
    join(
      tmpdir(),
      "freeflow-self-review",
      `${basename(root)}-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`,
    ),
);
mkdirSync(scratch, { recursive: true });
const logPath = join(scratch, "self-review-checks.jsonl");
const head = () => {
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).trim();
  } catch {
    return null;
  }
};

// The state a check observed: HEAD, every uncommitted change to tracked files, and every untracked file's content.
// Files under the scratch folder are left out, so recording a check does not change the state it recorded.
function stamp() {
  const hash = createHash("sha256");
  const commit = head();
  hash.update(`${commit}\n`);
  if (commit) hash.update(git(root, ["-c", "core.quotePath=false", "diff", "--binary", "--no-ext-diff", "HEAD"]));
  const inScratch = (path) => !relative(scratch, join(root, path)).startsWith("..");
  for (const path of git(root, ["ls-files", "-z", "--others", "--exclude-standard"]).split("\0").filter(Boolean)) {
    if (inScratch(path)) continue;
    hash.update(`\0${path}\0`);
    try {
      hash.update(readFileSync(join(root, path)));
    } catch {
      hash.update("unreadable");
    }
  }
  return hash.digest("hex").slice(0, 16);
}

const readLog = () =>
  existsSync(logPath)
    ? readFileSync(logPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line)];
          } catch {
            return [];
          }
        })
    : [];

if (mode === "check") {
  if (!values.id) fail(`check needs --id\n${USAGE}`);
  const words = dash === -1 ? [] : argv.slice(dash + 1);
  if (!values.command && !words.length) fail(`check needs --command or a command after --\n${USAGE}`);
  const before = stamp();
  const result = values.command
    ? spawnSync(values.command, { cwd: root, shell: true, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
    : spawnSync(words[0], words.slice(1), { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error.message) : ""}`;
  const exit = result.status ?? 1;
  // A check that edits files (a formatter, a snapshot update) observed the state before its edits only.
  const after = stamp();
  const entry = {
    id: values.id,
    command: values.command ?? words.join(" "),
    exit,
    at: new Date().toISOString(),
    head: head(),
    stamp: before,
    changedState: after !== before,
    tail: output.trimEnd().split("\n").slice(-20),
  };
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  process.stdout.write(output);
  console.log(
    `\n${values.id}: exit ${exit}; recorded in ${logPath}${entry.changedState ? " (the command changed files: rerun it to check the new state)" : ""}`,
  );
  process.exit(exit);
}

if (!values.base) fail(USAGE);
try {
  git(root, ["rev-parse", "--verify", "--quiet", `${values.base}^{commit}`]);
} catch {
  fail(`no such commit: ${values.base}`);
}
const baseCommit = git(root, ["rev-parse", `${values.base}^{commit}`]).trim();

const capped = (lines, cap = CAP) => ({ lines: lines.slice(0, cap), cut: Math.max(0, lines.length - cap) });
const status = capped(git(root, ["status", "--short", "--branch"]).trimEnd().split("\n").filter(Boolean));
const stat = git(root, ["-c", "core.quotePath=false", "diff", "--stat=120", "--no-color", "--no-ext-diff", baseCommit])
  .trimEnd()
  .split("\n")
  .filter(Boolean);
const untracked = git(root, ["ls-files", "-z", "--others", "--exclude-standard"])
  .split("\0")
  .filter(Boolean)
  .filter((path) => relative(scratch, join(root, path)).startsWith(".."));

const testChanges = (extra) => {
  const result = spawnSync(process.execPath, [TEST_CHANGES, "--base", baseCommit, "--root", root, "--json", ...extra], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) fail(`test-changes failed: ${(result.stderr || result.stdout).trim()}`);
  return JSON.parse(result.stdout);
};
const changedTests = testChanges([]).changes.map((change) => {
  const hunk = change.hunks ? change.hunks.split("\n") : [];
  return { ...change, hunks: hunk.slice(0, 80).join("\n"), hunkLinesCut: Math.max(0, hunk.length - 80) };
});

// New tests, each run on the base in a temporary worktree: a new test that passes there may not test the change.
const newTests = testChanges(["--new"]).tests.map((each) => ({ ...each, onBase: null }));
const testCommand = values["test-command"];
if (testCommand && newTests.some((each) => each.kind === "test")) {
  const where = join(scratch, `base-${process.pid}-${Date.now()}`);
  gitOrFail(root, ["worktree", "add", "--detach", "--quiet", where, baseCommit], "git worktree add failed");
  try {
    if (existsSync(join(root, "node_modules")) && !existsSync(join(where, "node_modules")))
      symlinkSync(join(root, "node_modules"), join(where, "node_modules"), "dir");
    // Every new file goes in, so a new test's new fixture is there too.
    for (const each of newTests) {
      mkdirSync(dirname(join(where, each.path)), { recursive: true });
      copyFileSync(join(root, each.path), join(where, each.path));
    }
    for (const each of newTests.filter((test) => test.kind === "test").slice(0, 10)) {
      const command = testCommand.includes("{file}")
        ? testCommand.replaceAll("{file}", each.path)
        : `${testCommand} ${each.path}`;
      const run = spawnSync(command, { cwd: where, shell: true, encoding: "utf8", timeout: 300_000 });
      const tail = `${run.stdout ?? ""}${run.stderr ?? ""}`.trimEnd().split("\n").slice(-5);
      each.onBase = {
        command,
        exit: run.status,
        result: run.status === 0 ? "passes on the base: it may not test the change" : "fails on the base",
        tail,
      };
    }
  } finally {
    try {
      git(root, ["worktree", "remove", "--force", where]);
    } catch {
      // Reported below: the agent removes it by hand.
    }
  }
  if (existsSync(where)) newTests.push({ status: "note", path: where, kind: "leftover worktree: remove it" });
}

// Requirements and their last recorded checks.
const current = stamp();
const log = readLog();
let requirements = [];
if (values.requirements) {
  const file = resolve(values.requirements);
  if (!existsSync(file)) fail(`no such requirements file: ${values.requirements}`);
  requirements = readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(?:[-*]\s+)?\**(R\d+)\**[:.)\]]?\s+(.*)$/.exec(line);
      if (!match) return [];
      const check = /\bcheck:\s*`?([^`]+?)`?\s*$/i.exec(match[2]);
      const text = (check ? match[2].slice(0, check.index) : match[2]).replace(/[\s—–-]+$/, "").trim();
      return [{ id: match[1], text, check: check?.[1] ?? null }];
    })
    .map((requirement) => {
      const last = log.filter((entry) => entry.id === requirement.id).at(-1) ?? null;
      const afterLastEdit = last ? last.stamp === current && !last.changedState : false;
      return {
        ...requirement,
        lastCheck: last && { command: last.command, exit: last.exit, at: last.at, head: last.head },
        afterLastEdit,
        state: !last
          ? "no check recorded"
          : afterLastEdit
            ? last.exit === 0
              ? "passed on the current state"
              : `failed on the current state (exit ${last.exit})`
            : "stale: the change differs from the state it checked; rerun it",
      };
    });
}

// Added lines that look like leftover debug output or notes, in tracked files and untracked ones.
const leftovers = [];
let file = null;
let line = 0;
for (const text of git(root, [
  "-c",
  "core.quotePath=false",
  "diff",
  "--no-color",
  "--no-ext-diff",
  "--unified=0",
  baseCommit,
]).split("\n")) {
  const header = /^\+\+\+ b\/(.*)$/.exec(text);
  if (header) file = header[1];
  const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(text);
  if (hunk) line = Number(hunk[1]);
  else if (text.startsWith("+") && !text.startsWith("+++")) {
    if (LEFTOVER.test(text)) leftovers.push({ at: `${file}:${line}`, text: text.slice(1).trim().slice(0, 160) });
    line += 1;
  }
}
for (const path of untracked) {
  let contents;
  try {
    contents = readFileSync(join(root, path), "utf8");
  } catch {
    continue;
  }
  if (contents.includes("\0")) continue;
  contents.split("\n").forEach((text, index) => {
    if (LEFTOVER.test(text)) leftovers.push({ at: `${path}:${index + 1}`, text: text.trim().slice(0, 160) });
  });
}

const report = {
  command: "self-review",
  root,
  base: { ref: values.base, commit: baseCommit },
  head: head(),
  stamp: current,
  status: status.lines,
  statusCut: status.cut,
  diffStat: stat,
  untracked,
  changedTests,
  newTests,
  requirements,
  leftovers: leftovers.slice(0, 20),
  leftoversCut: Math.max(0, leftovers.length - 20),
  notChecked: [
    "whether each change is justified: judge every changed test and fixture with the user",
    "callers of what changed: rerun the queries from Find what the change touches (touch-map.mjs)",
    ...(testCommand ? [] : ["new tests on the base: pass --test-command to see each one fail there"]),
    ...(values.requirements ? [] : ["requirements: pass --requirements with one line per requirement"]),
  ],
};

const md = [`# Self-review: ${values.base} (${baseCommit.slice(0, 12)}) -> working tree`, ""];
md.push("## Status", "", "```text", ...status.lines, "```");
if (status.cut) md.push(`(${status.cut} more lines cut)`);
md.push("", "## Diff stat against the base", "", "```text", ...(stat.length ? stat : ["no tracked changes"]), "```");
if (untracked.length)
  md.push(`Untracked: ${untracked.slice(0, CAP).join(", ")}${untracked.length > CAP ? ", ..." : ""}`);
md.push("", `## Changed existing tests, fixtures and setup (${changedTests.length})`, "");
if (!changedTests.length) md.push("None.");
for (const change of changedTests) {
  md.push(
    `### ${change.status} ${change.kind} ${change.to ? `${change.path} -> ${change.to}` : change.path} (+${change.added} -${change.removed})`,
  );
  if (change.hunks) md.push("", "```diff", change.hunks, "```");
  if (change.hunkLinesCut) md.push(`(${change.hunkLinesCut} more diff lines cut)`);
  md.push("");
}
md.push("", `## New tests (${newTests.length})`, "");
if (!newTests.length) md.push("None.");
for (const each of newTests)
  md.push(
    `- ${each.kind} ${each.path}${each.onBase ? `: ${each.onBase.result} (\`${each.onBase.command}\` exit ${each.onBase.exit})` : each.kind === "test" ? ": not run on the base" : ""}`,
  );
md.push("", `## Requirements (${requirements.length})`, "");
if (!values.requirements) md.push("No requirements file given.");
for (const requirement of requirements) {
  md.push(`- ${requirement.id} ${requirement.text} — ${requirement.state}`);
  if (requirement.lastCheck)
    md.push(
      `  - last check: \`${requirement.lastCheck.command}\` exit ${requirement.lastCheck.exit} at ${requirement.lastCheck.at}`,
    );
  else if (requirement.check)
    md.push(`  - record one: self-review.mjs check --id ${requirement.id} --command "${requirement.check}"`);
}
md.push("", `## Possible leftovers (${leftovers.length})`, "");
if (!leftovers.length) md.push("None found.");
for (const each of report.leftovers) md.push(`- ${each.at}: ${each.text}`);
if (report.leftoversCut) md.push(`(${report.leftoversCut} more cut)`);
md.push("", "## Not checked by this report", "", ...report.notChecked.map((item) => `- ${item}`), "");
const reportPath = join(scratch, "self-review.md");
writeFileSync(reportPath, md.join("\n"));
report.reportPath = reportPath;

if (values.json) console.log(JSON.stringify(report, null, 2));
else {
  const stale = requirements.filter((each) => !each.afterLastEdit).length;
  const passingOnBase = newTests.filter((each) => each.onBase?.exit === 0).length;
  console.log(`Self-review report: ${reportPath}`);
  console.log(
    `${stat.length ? stat.at(-1).trim() : "no tracked changes"}; ${untracked.length} untracked; ${changedTests.length} changed existing test file(s); ${newTests.length} new; ${passingOnBase} new test(s) pass on the base; ${requirements.length} requirement(s), ${stale} without a check after the last edit; ${leftovers.length} possible leftover(s).`,
  );
  console.log("Read the report before you report the change.");
}
