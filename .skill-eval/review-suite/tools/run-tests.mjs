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
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
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
    // Emit continues past type errors from dependencies the installed node_modules lacks, as the build would.
    const build = spawnSync(
      path.join(tree, "node_modules", ".bin", "tsc"),
      ["-p", "pi-extension/tsconfig.json", "--noEmitOnError", "false"],
      { cwd: tree, encoding: "utf8", timeout: 240000 },
    );
    console.log(`$ tsc -p pi-extension/tsconfig.json (exit ${build.status})`);
  }
  console.log(`$ node --test ${tests.files.join(" ")}`);
  const run = spawnSync(process.execPath, ["--test", ...tests.files], {
    cwd: tree,
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(scrub(run.stdout ?? ""));
  process.stderr.write(scrub(run.stderr ?? ""));
  process.exitCode = run.status ?? 1;
} finally {
  rmSync(tree, { recursive: true, force: true });
}
