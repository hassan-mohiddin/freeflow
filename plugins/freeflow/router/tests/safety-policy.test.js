import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(new URL("../../../../", import.meta.url).pathname);

async function readRepoFile(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

test("output-router skill safety policy documents exactness-sensitive routing cases", async () => {
  const skill = await readRepoFile("plugins/freeflow/skills/output-router/SKILL.md");
  const policy = await readRepoFile("plugins/freeflow/skills/output-router/references/safety-policy.md");

  assert.match(skill, /name: output-router/);
  assert.match(skill, /references\/safety-policy\.md/);

  assert.match(policy, /# Output Router Safety Policy/);
  assert.match(policy, /Do not silently summarize or compress/);
  assert.match(policy, /user-requested exact\/full output/);
  assert.match(policy, /small outputs/);
  assert.match(policy, /verification output needed for completion claims/);
  assert.match(policy, /failure evidence needed for diagnosis/);
  assert.match(policy, /source-truth conflict evidence/);
  assert.match(policy, /security, privacy, billing, data-loss, or public API evidence/);
  assert.match(policy, /`preserve: full`/);
  assert.match(policy, /vaulting and exact chunk retrieval/);
});

test("routing implementation references the safety policy where exactness rules are enforced", async () => {
  const runSource = await readRepoFile("plugins/freeflow/router/src/run.ts");
  const piExtension = await readRepoFile("plugins/freeflow/pi-extension/index.js");

  assert.match(runSource, /skills\/output-router\/references\/safety-policy/);
  assert.match(piExtension, /skills\/output-router\/references\/safety-policy/);
});
