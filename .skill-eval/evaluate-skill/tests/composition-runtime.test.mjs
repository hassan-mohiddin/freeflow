import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createCompositionRuntimeExtension } from "../../../skills/evaluate-skill/scripts/pi-composition-runtime.mjs";

const marker = {
  type: "custom_message",
  customType: "freeflow-workflow-bootstrap",
};

test("composition runtime matches the production envelope, suppresses active duplicates, and reloads after compaction", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-composition-runtime-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const interactionContractPath = resolve(root, "interaction-contract.md");
  const workflowPath = resolve(root, "workflow.md");
  const evidencePath = resolve(root, "runtime-evidence.jsonl");
  await writeFile(interactionContractPath, "# Freeflow Interaction Contract\n\nInteraction rule.\n");
  await writeFile(workflowPath, "---\nname: workflow\ndescription: test\n---\n\n# Workflow\n\nWorkflow rule.\n");

  const handlers = new Map();
  createCompositionRuntimeExtension({ interactionContractPath, workflowPath, evidencePath })({
    on(event, handler) {
      handlers.set(event, handler);
    },
  });
  const before = handlers.get("before_agent_start");
  let activeEntries = [];
  const persistedEntries = [marker];
  const ctx = {
    sessionManager: {
      buildContextEntries() {
        return activeEntries;
      },
      getEntries() {
        return persistedEntries;
      },
    },
  };

  const first = await before({ systemPrompt: "base" }, ctx);
  assert.ok(first.systemPrompt.startsWith("base\n\n# Freeflow Runtime Context"));
  assert.match(first.systemPrompt, /# Freeflow Interaction Contract/);
  assert.deepEqual(first.message, {
    customType: "freeflow-workflow-bootstrap",
    content:
      "# Freeflow Workflow Bootstrap\n\n---\nname: workflow\ndescription: test\n---\n\n# Workflow\n\nWorkflow rule.",
    display: false,
    details: { skill: "workflow", source: "first-turn-bootstrap" },
  });

  activeEntries = [marker];
  const second = await before({ systemPrompt: "base" }, ctx);
  assert.equal(second.message, undefined);

  activeEntries = [];
  const afterCompaction = await before({ systemPrompt: "base" }, ctx);
  assert.equal(afterCompaction.message.customType, "freeflow-workflow-bootstrap");

  const records = (await readFile(evidencePath, "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(
    records.map((record) => record.workflow_delivered),
    [true, false, true],
  );
  assert.deepEqual(
    records.map((record) => record.workflow_delivery_reason),
    ["initial", "suppressed-active-marker", "active-marker-missing"],
  );
  assert.match(records[0].workflow_envelope_sha256, /^[a-f0-9]{64}$/);
  assert.equal(records[1].workflow_envelope_sha256, null);
  assert.equal(records[2].workflow_envelope_sha256, records[0].workflow_envelope_sha256);
  assert.equal(new Set(records.map((record) => record.interaction_contract_sha256)).size, 1);
  assert.equal(new Set(records.map((record) => record.workflow_sha256)).size, 1);
});
