// Proof for rs-25844ce3: publishResult must refuse an existing destination before preparing anything.
// Run with EXPORT_ROOT=<export root>; the module is loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const exportRoot = process.env.EXPORT_ROOT;
const { publishResult } = await import(
  pathToFileURL(join(exportRoot, "skills/evaluate-skill/scripts/lib/publication.mjs")).href
);

async function setup(t, label) {
  const base = await mkdtemp(join(process.env.PROOF_SCRATCH ?? tmpdir(), `publish-${label}-`));
  t.after(() => rm(base, { recursive: true, force: true }));
  const staging = join(base, "staging");
  const destination = join(base, "evaluations", "one");
  await mkdir(staging, { recursive: true });
  await writeFile(join(staging, "result.json"), '{"new":true}\n');
  return { staging, destination };
}

test("empty existing destination is refused and left in place", async (t) => {
  const { staging, destination } = await setup(t, "empty");
  await mkdir(destination, { recursive: true });
  const before = (await stat(destination)).ino;
  let prepared = false;
  const outcome = await publishResult({
    stagingDir: staging,
    destinationDir: destination,
    prepare: async () => {
      prepared = true;
    },
    verify: async () => {},
  });
  const after = (await stat(destination)).ino;
  console.log(`empty destination: status=${outcome.status} prepared=${prepared} replaced=${before !== after}`);
  assert.equal(outcome.status, "publication-failed");
  assert.equal(prepared, false);
  assert.equal(before, after);
});

test("populated existing destination is refused and its content kept", async (t) => {
  const { staging, destination } = await setup(t, "populated");
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "result.json"), '{"old":true}\n');
  let prepared = false;
  const outcome = await publishResult({
    stagingDir: staging,
    destinationDir: destination,
    prepare: async () => {
      prepared = true;
    },
    verify: async () => {},
  });
  const kept = await readFile(join(destination, "result.json"), "utf8");
  console.log(`populated destination: status=${outcome.status} prepared=${prepared} kept=${kept.trim()}`);
  assert.equal(outcome.status, "publication-failed");
  assert.equal(prepared, false);
  assert.equal(kept, '{"old":true}\n');
});
