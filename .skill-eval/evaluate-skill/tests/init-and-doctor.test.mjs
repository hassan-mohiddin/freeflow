import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { doctorReport } from "../../../skills/evaluate-skill/scripts/lib/doctor.mjs";
import { initSkillWorkspace } from "../../../skills/evaluate-skill/scripts/lib/workspace.mjs";

test("init creates only suite and first case source", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-init-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await initSkillWorkspace({ root, skill: "sample-skill" });
  await access(result.suitePath);
  await access(result.casePath);
  assert.deepEqual((await readdir(result.skillRoot)).sort(), ["cases", "suite.json"]);
  await assert.rejects(() => initSkillWorkspace({ root, skill: "sample-skill" }), /exist/);
});

test("doctor proves Pi guard without model calls", async () => {
  const report = await doctorReport();
  assert.equal(report.model_requests, 0);
  assert.equal(report.node.supported, true);
  assert.equal(report.pi.available, true);
  assert.equal(report.root_guard.available, true, JSON.stringify(report.root_guard));
  assert.equal(report.ready_for_planning, true);
  assert.equal(report.pi.capabilities.rpc_jsonl, true, report.pi.rpc_error);
  assert.equal(report.pi.capabilities.multi_turn, true, report.pi.rpc_error);
  assert.equal(report.ready_for_rpc_planning, true);
});
