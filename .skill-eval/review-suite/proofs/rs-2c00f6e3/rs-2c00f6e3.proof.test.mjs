// Proof probe for rs-2c00f6e3: decision reference validation must reject malformed D-NNN values.
// Run with EXPORT=<export root> node --test <this file>
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const exportRoot = process.env.EXPORT;
const script = join(exportRoot, "skills/track-work/scripts/working-record.mjs");

async function call(cwd, args) {
  try {
    const { stdout } = await run(process.execPath, [script, ...args], { cwd, maxBuffer: 1024 * 1024 });
    return { exitCode: 0, json: JSON.parse(stdout) };
  } catch (error) {
    return { exitCode: error.code, json: JSON.parse(error.stdout) };
  }
}

async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "rs-2c00-proof-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const write = async (name, value) => {
    const path = join(root, name);
    await writeFile(path, JSON.stringify(value));
    return path;
  };
  const init = await call(root, [
    "init",
    "--root",
    root,
    "--name",
    "proof",
    "--input",
    await write("init.json", { taskName: "Proof" }),
  ]);
  assert.equal(init.exitCode, 0);
  const record = init.json.record.path;
  let sha = init.json.record.sha256;
  for (const title of ["Original", "Replacement"]) {
    const added = await call(root, [
      "update",
      "--record",
      record,
      "--expected-sha",
      sha,
      "--input",
      await write(`${title}.json`, { decision: { operation: "add", title, decision: title } }),
    ]);
    assert.equal(added.exitCode, 0, JSON.stringify(added.json));
    sha = added.json.record.sha256;
  }
  return { root, record, sha, write };
}

test("a supersedes value with a trailing newline is rejected and nothing is written", async (t) => {
  const { root, record, sha, write } = await setup(t);
  const result = await call(root, [
    "update",
    "--record",
    record,
    "--expected-sha",
    sha,
    "--input",
    await write("nl.json", { decision: { operation: "add", title: "Malformed", supersedes: "D-001\n" } }),
  ]);
  assert.equal(
    result.exitCode,
    1,
    `expected rejection, got exit ${result.exitCode}: ${JSON.stringify(result.json).slice(0, 300)}`,
  );
  assert.equal(result.json.errors[0].code, "invalid-decision-reference");
  assert.equal(result.json.record.sha256, sha);
});

test("a supersedes value with trailing text fails with invalid-decision-reference", async (t) => {
  const { root, record, sha, write } = await setup(t);
  const result = await call(root, [
    "update",
    "--record",
    record,
    "--expected-sha",
    sha,
    "--input",
    await write("text.json", { decision: { operation: "add", title: "Malformed", supersedes: "D-001 extra" } }),
  ]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.json.errors[0].code, "invalid-decision-reference");
});

test("a well-formed supersedes value is still accepted", async (t) => {
  const { root, record, sha, write } = await setup(t);
  const result = await call(root, [
    "update",
    "--record",
    record,
    "--expected-sha",
    sha,
    "--input",
    await write("ok.json", { decision: { operation: "add", title: "Good", supersedes: "D-001" } }),
  ]);
  assert.equal(result.exitCode, 0, JSON.stringify(result.json).slice(0, 300));
});
