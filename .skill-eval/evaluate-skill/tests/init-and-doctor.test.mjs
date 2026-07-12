import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { probeCodex } from "../../../skills/evaluate-skill/scripts/lib/capabilities.mjs";
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

test("Codex public capability probe runs version only and remains diagnostic", () => {
  const calls = [];
  const codex = probeCodex({ run: (command, args) => {
    calls.push({ command, args });
    return { status: 0, stdout: "codex-cli 0.144.1\n", stderr: "", error: null };
  } });
  assert.deepEqual(calls, [{ command: "codex", args: ["--version"] }]);
  assert.equal(codex.fidelity, "diagnostic");
  assert.equal(codex.capabilities.strict_filesystem_isolation, true);
  assert.equal(codex.capabilities.provider_request_bound, false);
  assert.equal(codex.capabilities.spend_bound, false);
});

test("doctor proves Pi guard and Codex diagnostic status without model calls", async () => {
  const report = await doctorReport();
  assert.equal(report.model_requests, 0);
  assert.equal(report.node.supported, true);
  assert.equal(report.pi.available, true);
  assert.equal(report.root_guard.available, true, JSON.stringify(report.root_guard));
  assert.equal(report.ready_for_planning, true);
  assert.equal(report.pi.capabilities.rpc_jsonl, true, report.pi.rpc_error);
  assert.equal(report.pi.capabilities.multi_turn, true, report.pi.rpc_error);
  assert.equal(report.ready_for_rpc_planning, true);
  assert.equal(report.codex.version, "codex-cli 0.144.1");
  assert.equal(report.codex.fidelity, "diagnostic");
  assert.equal(report.ready_for_codex_diagnostic_planning, true);
  assert.equal(report.ready_for_codex_model_execution, false);
});
