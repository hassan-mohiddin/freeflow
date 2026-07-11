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
  await writeFile(resolve(run, "metadata.json"), JSON.stringify({
    variant: "opaque",
    activation: { skill_read: false },
    changed_paths: ["case.json"],
    assertion_root: "workspace",
    evidence_classes: { requested: {} },
  }));
  await writeFile(resolve(run, "inputs", "case.json"), JSON.stringify({
    id: "GRADE-001",
    assertions: [
      { id: "status", type: "json_field_in", path: "case.json", field: "status", values: ["draft", "draft-unevaluated", "unverified"] },
      { id: "paths", type: "changed_paths", equals: ["case.json"] },
    ],
  }));
  await writeFile(resolve(run, "before-manifest.json"), JSON.stringify({ files: {} }));
  await writeFile(resolve(run, "after-manifest.json"), JSON.stringify({ files: { "case.json": { type: "file", sha256: "x", lines: 1 } } }));
  await writeFile(resolve(run, "artifacts", "workspace", "case.json"), JSON.stringify({ status: "draft-unevaluated" }));
  await writeFile(resolve(run, "final.md"), "Everything is production-ready.");
  const grade = await gradeObjectiveRun(run);
  assert.equal(grade.verdict, "pass");
  assert.equal(grade.assertions[0].evidence.actual, "draft-unevaluated");
});
