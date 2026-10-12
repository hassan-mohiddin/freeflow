// Proof for f7-04: the mismatch message must be the one requirement 4 names.
// Run with EXPORT_ROOT=<export root>; the module is loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const lib = join(process.env.EXPORT_ROOT, "skills/evaluate-skill/scripts/lib");
const { verifyBundleIntegrity, writeBundleIntegrity } = await import(pathToFileURL(join(lib, "integrity.mjs")).href);

test("a tampered bundle fails with the message requirement 4 names", async (t) => {
  const root = await mkdtemp(join(process.env.PROOF_SCRATCH ?? tmpdir(), "f7-04-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "evidence"), { recursive: true });
  await writeFile(join(root, "result.json"), "{}\n");
  await writeFile(join(root, "evidence", "final.md"), "answer\n");
  await writeBundleIntegrity(root);
  await writeFile(join(root, "evidence", "final.md"), "tampered\n");
  const message = await verifyBundleIntegrity(root).then(
    () => "accepted",
    (error) => error.message,
  );
  console.log(`tamper message: ${message}`);
  assert.match(message, /Bundle integrity mismatch before publication/);
});
