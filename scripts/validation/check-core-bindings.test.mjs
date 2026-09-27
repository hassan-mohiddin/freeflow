import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const script = join(root, "scripts/validation/check-core-bindings.mjs");
const reference = join(root, "capabilities/tool-execution/references/generated-program-bindings.md");
const run = (...args) =>
  spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", timeout: 180_000 });

test("checked-in core bindings match exact descriptors and a stale reference fails the same check", async () => {
  const good = run();
  assert.equal(good.status, 0, good.stderr || good.stdout);
  assert.match(good.stdout, /Core program bindings match/);
  const original = await readFile(reference, "utf8");
  const stale = original.replace("namespace FF_project_readRanges_1", "namespace FF_stale_readRanges_1");
  assert.notEqual(stale, original);
  const directory = await mkdtemp(join(tmpdir(), "freeflow-binding-drift-"));
  try {
    const target = join(directory, "reference.md");
    await writeFile(target, stale);
    const rejected = run("--check-reference", target);
    assert.notEqual(rejected.status, 0, "a changed declaration must fail validation");
    assert.match(rejected.stderr, /Generated core program bindings drifted/);
    assert.equal(await readFile(reference, "utf8"), original, "the rejected fixture must not touch the real reference");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
