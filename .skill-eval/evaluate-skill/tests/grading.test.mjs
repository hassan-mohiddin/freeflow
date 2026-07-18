import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { gradeObjectiveRun } from "../../../skills/evaluate-skill/scripts/lib/grade.mjs";

test("objective grading accepts bounded status vocabulary and ignores confident prose", async (t) => {
  const run = await mkdtemp(resolve(tmpdir(), "freeflow-grade-test-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await mkdir(resolve(run, "artifacts", "workspace"), { recursive: true });
  await writeFile(
    resolve(run, "metadata.json"),
    JSON.stringify({
      variant: "opaque",
      activation: { skill_read: false },
      changed_paths: ["case.json"],
      assertion_root: "workspace",
      evidence_classes: { requested: {} },
    }),
  );
  await writeFile(
    resolve(run, "inputs", "case.json"),
    JSON.stringify({
      id: "GRADE-001",
      assertions: [
        {
          id: "status",
          type: "json_field_in",
          path: "case.json",
          field: "status",
          values: ["draft", "draft-unevaluated", "unverified"],
        },
        { id: "paths", type: "changed_paths", equals: ["case.json"] },
      ],
    }),
  );
  await writeFile(resolve(run, "before-manifest.json"), JSON.stringify({ files: {} }));
  await writeFile(
    resolve(run, "after-manifest.json"),
    JSON.stringify({ files: { "case.json": { type: "file", sha256: "x", lines: 1 } } }),
  );
  await writeFile(resolve(run, "artifacts", "workspace", "case.json"), JSON.stringify({ status: "draft-unevaluated" }));
  await writeFile(resolve(run, "final.md"), "Everything is production-ready.");
  const grade = await gradeObjectiveRun(run);
  assert.equal(grade.verdict, "pass");
  assert.equal(grade.assertions[0].evidence.actual, "draft-unevaluated");
});

test("objective grading uses frozen intermediate turn evidence", async (t) => {
  const run = await mkdtemp(resolve(tmpdir(), "freeflow-turn-grade-test-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await mkdir(resolve(run, "artifacts", "workspace"), { recursive: true });
  const empty = { files: {} };
  const created = { files: { "authorized.txt": { type: "file", sha256: "x", lines: 1 } } };
  await writeFile(
    resolve(run, "metadata.json"),
    JSON.stringify({
      variant: "opaque",
      execution_mode: "rpc-scripted",
      activation: { skill_read: true, skill_reads: { "base-skill": true, "target-skill": true } },
      changed_paths: ["authorized.txt"],
      assertion_root: "workspace",
      evidence_classes: { requested: {} },
    }),
  );
  await writeFile(
    resolve(run, "inputs", "case.json"),
    JSON.stringify({
      id: "GRADE-RPC-001",
      assertions: [
        { id: "turn-1-clean", type: "changed_paths", equals: [], turn_id: "turn-1" },
        { id: "turn-2-created", type: "changed_paths", equals: ["authorized.txt"], turn_id: "turn-2" },
        { id: "unchanged-before-decision", type: "path_unchanged", path: "authorized.txt", turn_id: "turn-1" },
        { id: "exists-after-decision", type: "path_exists", path: "authorized.txt", turn_id: "turn-2" },
        { id: "skill-read-first", type: "skill_read", turn_id: "turn-1" },
        { id: "base-read-first", type: "component_read", component: "base-skill", turn_id: "turn-1" },
        { id: "target-not-read-first", type: "component_not_read", component: "target-skill", turn_id: "turn-1" },
        { id: "target-read-second", type: "component_read", component: "target-skill", turn_id: "turn-2" },
        {
          id: "turn-text",
          type: "turn_text_contains",
          turn_id: "turn-2",
          contains: ["authorized"],
          forbids: ["forbidden"],
        },
      ],
    }),
  );
  await writeFile(resolve(run, "before-manifest.json"), JSON.stringify(empty));
  await writeFile(resolve(run, "after-manifest.json"), JSON.stringify(created));
  await writeFile(
    resolve(run, "transcript.json"),
    JSON.stringify({
      schema_version: 1,
      turns: [
        {
          id: "turn-1",
          final_text: "waiting",
          skill_read: true,
          skill_reads: { "base-skill": true, "target-skill": false },
          workspace: { manifest: empty, changed_paths: [] },
        },
        {
          id: "turn-2",
          final_text: "authorized",
          skill_read: true,
          skill_reads: { "base-skill": false, "target-skill": true },
          workspace: { manifest: created, changed_paths: ["authorized.txt"] },
        },
      ],
    }),
  );
  const grade = await gradeObjectiveRun(run);
  assert.equal(grade.verdict, "pass");
  assert.equal(
    grade.assertions.every((assertion) => assertion.state === "pass"),
    true,
  );
});
