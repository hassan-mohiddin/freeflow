// Proof for f7-01: a working-tree subject resource that climbs out of its variant must be refused.
// Run with EXPORT_ROOT=<export root>; the module is loaded from that export only.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const lib = join(process.env.EXPORT_ROOT, "skills/evaluate-skill/scripts/lib");
const { materializeSkillVariant } = await import(pathToFileURL(join(lib, "materialize.mjs")).href);

test("a working-tree resource that climbs out of the variant is refused", async (t) => {
  const scratch = await mkdtemp(join(process.env.PROOF_SCRATCH ?? tmpdir(), "f7-01-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const repo = join(scratch, "repo");
  await mkdir(join(repo, "skill"), { recursive: true });
  await writeFile(join(repo, "skill", "SKILL.md"), "---\nname: probe\n---\n");
  await writeFile(join(repo, "outside.md"), "outside the variant\n");
  const destination = join(scratch, "destination", "variant");
  const outcome = await materializeSkillVariant(
    repo,
    { kind: "working-tree", path: "skill", resources: ["../outside.md"] },
    destination,
  ).then(
    () => "accepted",
    (error) => `rejected (${error.message})`,
  );
  console.log(`climbing resource: ${outcome}`);
  assert.match(outcome, /^rejected/);
});
