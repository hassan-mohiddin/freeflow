import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildSemanticPrompt } from "../../../skills/evaluate-skill/scripts/lib/semantic.mjs";

test("semantic prompt uses opaque identity and fixed criteria", async (t) => {
  const run = await mkdtemp(resolve(tmpdir(), "freeflow-semantic-test-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await mkdir(resolve(run, "artifacts", "workspace"), { recursive: true });
  await writeFile(resolve(run, "metadata.json"), JSON.stringify({ variant: "candidate", changed_paths: ["answer.md"] }));
  await writeFile(resolve(run, "inputs", "case.json"), JSON.stringify({ prompt: "Answer the question.", assertions: [{ id: "quality", type: "semantic", rubric: "Answer directly and accurately." }] }));
  await writeFile(resolve(run, "objective-grade.json"), JSON.stringify({ objective_pass: true, assertions: [{ id: "path", type: "path_exists", state: "pass" }] }));
  await writeFile(resolve(run, "final.md"), "The answer is 4.");
  await writeFile(resolve(run, "diff"), "");
  await writeFile(resolve(run, "artifacts", "workspace", "answer.md"), "4\n");
  const built = await buildSemanticPrompt(run);
  assert.match(built.opaqueLabel, /^Run-[A-F0-9]{8}$/);
  assert.match(built.prompt, /Answer directly and accurately/);
  assert.equal(built.prompt.includes('"variant"'), false);
  assert.equal(built.prompt.includes("candidate"), false);
  assert.equal(built.prompt.includes(run), false);
});

test("semantic grading cannot repair objective failure", async (t) => {
  const run = await mkdtemp(resolve(tmpdir(), "freeflow-semantic-fail-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await writeFile(resolve(run, "metadata.json"), JSON.stringify({ variant: "old", changed_paths: [] }));
  await writeFile(resolve(run, "inputs", "case.json"), JSON.stringify({ prompt: "x", assertions: [{ id: "quality", type: "semantic", rubric: "x" }] }));
  await writeFile(resolve(run, "objective-grade.json"), JSON.stringify({ objective_pass: false, assertions: [] }));
  await assert.rejects(() => buildSemanticPrompt(run), /cannot repair/);
});
