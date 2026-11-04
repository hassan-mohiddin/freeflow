// A fixture taken from a commit of the definition root's own repository (SPEC-011 4.4): a task frozen at the commit
// its pull request started from, with no copy of the repository kept in the definition. The workspace is that
// commit's tree, as `git archive` writes it, less the paths `exclude` names; it has no Git history, so no later commit,
// and with it the task's answer, is in it. A reference solution may name another commit (the pull request's head),
// whose tree, less the same paths, is the solved workspace.

import { spawn } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { fingerprintDirectory } from "./sandbox.mjs";

const COMMIT = /^[0-9a-f]{40}$/;
const FIXTURE_FIELDS = new Set(["git", "exclude"]);

/** Whether a group's declared fixture is a commit rather than a folder. */
export function isGitFixture(fixture) {
  return fixture !== null && typeof fixture === "object" && !Array.isArray(fixture);
}

/**
 * Checks a declared `{ git, exclude }` fixture: `git` a full 40-character commit, `exclude` relative paths inside the
 * tree, each refused when absolute or climbing out of it. Returns the fixture with `exclude` defaulted to [].
 *
 * @param {any} value
 * @param {(message: string) => never} fail
 */
export function validateGitFixture(value, fail) {
  for (const key of Object.keys(value)) {
    if (!FIXTURE_FIELDS.has(key)) fail(`group.fixture contains unsupported field ${key}`);
  }
  if (typeof value.git !== "string" || !COMMIT.test(value.git)) {
    fail("group.fixture.git must be a full 40-character commit of the definition root's repository");
  }
  const exclude = value.exclude ?? [];
  if (!Array.isArray(exclude) || exclude.some((entry) => !safeRelative(entry))) {
    fail("group.fixture.exclude must be a list of relative paths inside the tree");
  }
  return { git: value.git, exclude: [...exclude] };
}

function safeRelative(entry) {
  if (typeof entry !== "string" || entry === "" || path.isAbsolute(entry)) return false;
  const normalized = path.posix.normalize(entry);
  return normalized !== "." && normalized !== ".." && !normalized.startsWith("../");
}

/**
 * Writes `commit`'s tree, less `exclude`, into `destination` (created, and expected empty), from the repository at
 * `root`. Refuses a commit the repository does not have.
 *
 * @param {{ root: string, commit: string, exclude?: string[], destination: string }} options
 */
export async function extractGitTree({ root, commit, exclude = [], destination }) {
  await mkdir(destination, { recursive: true });
  const pathspec = [".", ...exclude.map((entry) => `:(exclude)${entry}`)];
  await new Promise((resolve, reject) => {
    const archive = spawn("git", ["-C", root, "archive", "--format=tar", commit, "--", ...pathspec], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const tar = spawn("tar", ["-x", "-f", "-", "-C", destination], { stdio: ["pipe", "ignore", "pipe"] });
    let errors = "";
    archive.stderr.on("data", (chunk) => (errors += chunk));
    tar.stderr.on("data", (chunk) => (errors += chunk));
    archive.stdout.pipe(tar.stdin);
    let pending = 2;
    let failed = false;
    const done = (name) => (code) => {
      if (code !== 0 && !failed) {
        failed = true;
        reject(new Error(`the tree of ${commit} could not be written (${name}): ${errors.trim() || `exit ${code}`}`));
      }
      pending -= 1;
      if (pending === 0 && !failed) resolve();
    };
    archive.on("error", reject);
    tar.on("error", reject);
    archive.on("close", done("git archive"));
    tar.on("close", done("tar"));
  });
}

/**
 * The runner's snapshot of a commit fixture, in the shape `prepareFixture` gives a folder's: the tree written once
 * into the group's `resources/fixture`, which every arm's workspace copies.
 *
 * @param {{ fixture: { git: string, exclude: string[] }, root: string, groupDirectory: string }} options
 */
export async function prepareGitFixture({ fixture, root, groupDirectory }) {
  const snapshotPath = path.join(groupDirectory, "resources", "fixture");
  await extractGitTree({ root, commit: fixture.git, exclude: fixture.exclude, destination: snapshotPath });
  const canonical = await realpath(snapshotPath);
  return {
    declaredPath: `git:${fixture.git}`,
    sourcePath: null,
    git: { commit: fixture.git, exclude: [...fixture.exclude] },
    snapshotPath: canonical,
    files: await fingerprintDirectory(canonical),
  };
}
