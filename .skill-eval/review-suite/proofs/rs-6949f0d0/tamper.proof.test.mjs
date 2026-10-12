// Proof for rs-6949f0d0: a bundle changed after its integrity record must fail verification.
// Run with EXPORT_ROOT=<export root>; the modules are loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const exportRoot = process.env.EXPORT_ROOT;
const lib = join(exportRoot, "skills/evaluate-skill/scripts/lib");
const { verifyBundleIntegrity, writeBundleIntegrity } = await import(pathToFileURL(join(lib, "integrity.mjs")).href);
const { publishResult } = await import(pathToFileURL(join(lib, "publication.mjs")).href);

async function bundle(t, label) {
  const root = await mkdtemp(join(process.env.PROOF_SCRATCH ?? tmpdir(), `integrity-${label}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "evidence"), { recursive: true });
  await writeFile(join(root, "result.json"), "{}\n");
  await writeFile(join(root, "evidence", "final.md"), "answer\n");
  await writeBundleIntegrity(root);
  return root;
}

async function outcome(fn) {
  try {
    await fn();
    return "accepted";
  } catch (error) {
    return `rejected (${error.message})`;
  }
}

test("content change after the integrity record is rejected", async (t) => {
  const root = await bundle(t, "content");
  await writeFile(join(root, "evidence", "final.md"), "tampered\n");
  const result = await outcome(() => verifyBundleIntegrity(root));
  console.log(`content change: ${result}`);
  assert.match(result, /^rejected/);
});

test("added file after the integrity record is rejected", async (t) => {
  const root = await bundle(t, "added");
  await writeFile(join(root, "evidence", "extra.md"), "injected\n");
  const result = await outcome(() => verifyBundleIntegrity(root));
  console.log(`added file: ${result}`);
  assert.match(result, /^rejected/);
});

test("publication of a tampered staging bundle does not reach the destination", async (t) => {
  const base = await mkdtemp(join(process.env.PROOF_SCRATCH ?? tmpdir(), "integrity-publish-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const staging = join(base, "staging");
  const destination = join(base, "evaluations", "one");
  await mkdir(join(staging, "evidence"), { recursive: true });
  await writeFile(join(staging, "result.json"), "{}\n");
  await writeFile(join(staging, "evidence", "final.md"), "answer\n");
  const published = await publishResult({
    stagingDir: staging,
    destinationDir: destination,
    prepare: async () => {
      await writeBundleIntegrity(staging);
      await writeFile(join(staging, "evidence", "final.md"), "tampered\n");
    },
    verify: async () => verifyBundleIntegrity(staging),
  });
  const reached = await readFile(join(destination, "evidence", "final.md"), "utf8").then(
    () => true,
    () => false,
  );
  console.log(`publication of tampered bundle: status=${published.status} destination_has_bundle=${reached}`);
  assert.equal(published.status, "publication-failed");
  assert.equal(reached, false);
});
