import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { verifyBundleIntegrity, writeBundleIntegrity } from "../../../skills/evaluate-skill/scripts/lib/integrity.mjs";
import { publishResult } from "../../../skills/evaluate-skill/scripts/lib/publication.mjs";

async function bundle(t) {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-integrity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(resolve(root, "evidence"));
  await writeFile(resolve(root, "result.json"), "{}\n");
  await writeFile(resolve(root, "evidence", "final.md"), "answer\n");
  return root;
}

test("bundle integrity verifies the exact inventory while excluding its own record", async (t) => {
  const root = await bundle(t);
  const written = await writeBundleIntegrity(root);
  assert.match(written.inventory.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal("integrity.json" in written.inventory.files, false);
  assert.deepEqual(await verifyBundleIntegrity(root), written);
  assert.deepEqual(JSON.parse(await readFile(resolve(root, "integrity.json"), "utf8")), written);
});

test("bundle integrity rejects mutation between preparation and publication", async (t) => {
  const base = await mkdtemp(resolve(tmpdir(), "freeflow-integrity-publication-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const staging = resolve(base, "staging");
  const destination = resolve(base, "evaluations", "one");
  await mkdir(resolve(staging, "evidence"), { recursive: true });
  await writeFile(resolve(staging, "result.json"), "{}\n");
  await writeFile(resolve(staging, "evidence", "final.md"), "answer\n");
  const outcome = await publishResult({
    stagingDir: staging,
    destinationDir: destination,
    prepare: async () => {
      await writeBundleIntegrity(staging);
      await writeFile(resolve(staging, "evidence", "final.md"), "tampered\n");
    },
    verify: async () => verifyBundleIntegrity(staging),
  });
  assert.equal(outcome.status, "publication-failed");
  assert.match(outcome.failure.primary, /integrity mismatch/i);
  await assert.rejects(() => readFile(resolve(destination, "result.json"), "utf8"));
});
