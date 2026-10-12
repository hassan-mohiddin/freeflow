// Proof for f7-06: publishDiagnostic must refuse an existing destination.
// Run with EXPORT_ROOT=<export root>; the module is loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const lib = join(process.env.EXPORT_ROOT, "skills/evaluate-skill/scripts/lib");
const { publishDiagnostic } = await import(pathToFileURL(join(lib, "publication.mjs")).href);

test("a diagnostic is not published over an existing destination", async (t) => {
  const scratch = await mkdtemp(join(process.env.PROOF_SCRATCH ?? tmpdir(), "f7-06-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const staging = join(scratch, "staging");
  await mkdir(staging);
  const destination = join(scratch, "diagnostics", "one");
  await mkdir(destination, { recursive: true });
  const outcome = await publishDiagnostic({
    stagingDir: staging,
    destinationDir: destination,
    writeDiagnostic: async (dir) => writeFile(join(dir, "diagnostic.json"), "{}\n"),
  });
  console.log(`existing destination: ${outcome.status}`);
  assert.equal(outcome.status, "publication-failed");
});
