// Shared by the script tasks' hidden tests (copied beside each as .ftu-ledger-lib.mjs): run the project's own tests,
// a copy of the workspace with original files put back, and the command line with its data in a temporary folder.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const root = process.cwd();
export const TEST_FILES = ["test/**/*.test.js", "test/**/*.test.mjs"];

/** The project's tests in a folder: the exit status and output. */
export function projectTests(folder = root) {
  // Without the runner's NODE_TEST_CONTEXT, which would make the child report to this run and always exit 0.
  const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
  const result = spawnSync(process.execPath, ["--test", ...TEST_FILES], { cwd: folder, encoding: "utf8", env });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** The project's tests on a copy of the workspace with the named files restored from .ftu-original. */
export function testsWithOriginals(files) {
  const copy = mkdtempSync(join(tmpdir(), "ftu-original-"));
  try {
    cpSync(root, copy, { recursive: true, filter: (source) => !source.includes(".ftu-") });
    for (const file of files) cpSync(join(root, ".ftu-original", file), join(copy, file));
    return projectTests(copy);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

export const original = (file) => readFileSync(join(root, ".ftu-original", file), "utf8");
export const current = (file) => readFileSync(join(root, file), "utf8");

/** Runs `node src/cli.js <args>` with a ledger and budgets of its own; returns status, stdout, stderr. */
export function cli(args, { entries = [], budgets = {} } = {}) {
  const folder = mkdtempSync(join(tmpdir(), "ftu-ledger-"));
  try {
    writeFileSync(join(folder, "ledger.json"), JSON.stringify(entries));
    writeFileSync(join(folder, "budgets.json"), JSON.stringify(budgets));
    const result = spawnSync(process.execPath, [join(root, "src/cli.js"), ...args], {
      cwd: folder,
      encoding: "utf8",
      env: { ...process.env, LEDGER_FILE: join(folder, "ledger.json"), LEDGER_BUDGETS: join(folder, "budgets.json") },
    });
    const ledger = JSON.parse(readFileSync(join(folder, "ledger.json"), "utf8"));
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, ledger };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
