// The review suite's declared test command. A reviewer's workspace holds only the change (change.diff, files/,
// verification.md), so this rebuilds the full tree the change applies to: the case's base commit with the
// workspace's own files/ copied over it, the repository's installed node_modules linked in, and the TypeScript
// build run first when the case needs it. Then it runs the case's declared test files with node --test.
// The subject sees this command's argv and output, so the argv names only the neutral group ID, and the temporary
// tree's path is replaced by "." in the output.
// Usage (from a run's workspace): node <path to this file> <group-id>
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const suite = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(suite, "../..");
const groupId = process.argv[2];
const group = JSON.parse(readFileSync(path.join(suite, "groups.json"), "utf8")).groups.find(
  (row) => row.id === groupId,
);
if (!group) {
  console.error(`unknown group: ${groupId}`);
  process.exit(2);
}
const entry = JSON.parse(readFileSync(path.join(suite, "cases.json"), "utf8")).cases.find(
  (row) => row.case === group.case,
);
const tests = entry?.tests;
if (!tests || tests.files.length === 0) {
  console.error("no tests are declared for this change");
  process.exit(2);
}
const files = path.join(process.cwd(), "files");
if (!existsSync(files)) {
  console.error("run this from the workspace: files/ is missing");
  process.exit(2);
}

// The command tool shows at most 32 KB, so the report keeps one line per top-level test, the details of each failure
// (up to 30 lines) and the totals, instead of every subtest's TAP block.
function compact(tap) {
  const out = [];
  const lines = tap.split("\n");
  const indent = (line) => line.length - line.trimStart().length;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const failed = /^\s*not ok \d+ - /.test(line);
    if (/^ok \d+ - /.test(line) || failed) {
      out.push(line);
      if (failed) {
        // The failure's YAML block: the following lines indented deeper than the result line, up to 30 of them.
        let detail = 0;
        while (index + 1 < lines.length && indent(lines[index + 1]) > indent(line) && detail < 30) {
          if (/^\s*(not )?ok \d+ - /.test(lines[index + 1])) break;
          out.push(lines[(index += 1)]);
          detail += 1;
        }
      }
    } else if (/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) /.test(line)) out.push(line);
  }
  return `${out.join("\n")}\n`;
}

// Many reviewers run at once, and some tests depend on timing, so at most SLOTS test runs execute together on this
// machine; the others wait for a slot. A slot is a directory under the ignored runs folder, created atomically and
// treated as abandoned after 15 minutes.
const SLOTS = 3;
const slotRoot = path.join(root, ".skill-eval", "runs", ".review-suite-test-slots");
function takeSlot() {
  mkdirSync(slotRoot, { recursive: true });
  for (;;) {
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const directory = path.join(slotRoot, `slot-${slot}`);
      try {
        mkdirSync(directory);
        return directory;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const age = Date.now() - (statSync(directory, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
        if (age > 15 * 60 * 1000) rmSync(directory, { recursive: true, force: true });
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
}
const slot = takeSlot();

const tree = mkdtempSync(path.join(os.tmpdir(), "tree-"));
const real = realpathSync(tree);
const repository = realpathSync(root);
const scrub = (text) =>
  text.split(real).join(".").split(tree).join(".").split(repository).join(".").split(root).join(".");
try {
  execFileSync("sh", ["-c", `git -C "${root}" archive ${entry.base_commit} | tar -x -C "${tree}"`]);
  // Some tests read Git state, so the tree is a repository whose HEAD is the case's base commit, borrowing this
  // repository's objects read-only; files that differ from the base show as uncommitted changes.
  const objects = path.resolve(
    root,
    execFileSync("git", ["-C", root, "rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim(),
    "objects",
  );
  execFileSync("git", ["-C", tree, "init", "-q"]);
  writeFileSync(path.join(tree, ".git", "objects", "info", "alternates"), `${objects}\n`);
  execFileSync("git", ["-C", tree, "update-ref", "HEAD", entry.base_commit]);
  execFileSync("git", ["-C", tree, "read-tree", "HEAD"]);
  cpSync(files, tree, { recursive: true });
  symlinkSync(path.join(root, "node_modules"), path.join(tree, "node_modules"));
  if (tests.build) {
    // The tests import the compiled output, so the TypeScript sources are compiled first. This is preparation, not a
    // build check: emit continues past type errors from packages this environment lacks, and its status is not shown,
    // because it reflects this environment rather than the change.
    spawnSync(
      path.join(tree, "node_modules", ".bin", "tsc"),
      ["-p", "pi-extension/tsconfig.json", "--noEmitOnError", "false"],
      { cwd: tree, encoding: "utf8", timeout: 240000 },
    );
  }
  // Tests that fail here for environmental reasons, or intermittently under load, are skipped and named.
  const skips = (tests.skip ?? []).flatMap((pattern) => [`--test-skip-pattern=${pattern}`]);
  console.log(`$ node --test ${tests.files.join(" ")}`);
  if (skips.length > 0) console.log(`(skipped in this environment: ${tests.skip.join("; ")})`);
  const run = spawnSync(process.execPath, ["--test", ...skips, ...tests.files], {
    cwd: tree,
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(scrub(compact(run.stdout ?? "")));
  const stderr = scrub(run.stderr ?? "");
  process.stderr.write(stderr.length > 4000 ? `...\n${stderr.slice(-4000)}` : stderr);
  process.exitCode = run.status ?? 1;
} finally {
  rmSync(tree, { recursive: true, force: true });
  rmSync(slot, { recursive: true, force: true });
}
