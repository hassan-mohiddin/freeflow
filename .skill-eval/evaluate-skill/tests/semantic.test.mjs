import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildSemanticPrompt, gradeSemanticRun, validateSemanticResult } from "../../../skills/evaluate-skill/scripts/lib/semantic.mjs";

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
  assert.equal(built.prompt.includes('"id": "path"'), false);
  assert.equal(built.modelEvidence.rendered.format, "canonical-json");
  assert.match(built.prompt, /canonical JSON/);
  assert.equal(built.modelEvidence.rendered.reason, "compact-not-smaller");
  assert.deepEqual(built.criterionIds, ["quality"]);
});

test("semantic packet records upstream byte caps as explicit omissions", async (t) => {
  const run = await mkdtemp(resolve(tmpdir(), "freeflow-semantic-cap-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await mkdir(resolve(run, "artifacts", "workspace"), { recursive: true });
  await writeFile(resolve(run, "metadata.json"), JSON.stringify({ variant: "subject", changed_paths: [] }));
  await writeFile(resolve(run, "inputs", "case.json"), JSON.stringify({ prompt: "x", assertions: [{ id: "quality", type: "semantic", rubric: "x" }] }));
  await writeFile(resolve(run, "objective-grade.json"), JSON.stringify({ objective_pass: true, assertions: [] }));
  await writeFile(resolve(run, "final.md"), "x".repeat(31000));
  await writeFile(resolve(run, "diff"), "");
  const built = await buildSemanticPrompt(run);
  assert.equal(built.evidence.source_omissions[0].reason, "upstream-byte-cap");
  assert.equal(built.evidence.source_omissions[0].omitted_bytes, 1000);
  const omission = built.modelEvidence.records.find((record) => record.type === "O");
  const details = omission.fields.detail.split(";").map((item) => {
    const [reason, span, omittedBytes] = item.split(",");
    return { reason, span, omittedBytes: Number(omittedBytes) };
  });
  assert.equal(details.some((item) => item.reason === "upstream-byte-cap" && item.omittedBytes === 1000), true);
});

test("multi-turn semantic packet exposes only one shared declared turn scope", async (t) => {
  const run = await mkdtemp(resolve(tmpdir(), "freeflow-semantic-turns-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await writeFile(resolve(run, "metadata.json"), JSON.stringify({ variant: "candidate", execution_mode: "rpc-scripted", changed_paths: [] }));
  await writeFile(resolve(run, "inputs", "case.json"), JSON.stringify({
    turns: [
      { id: "turn-1", prompt: "first prompt" },
      { id: "turn-2", prompt: "undeclared secret prompt" },
      { id: "turn-3", prompt: "third prompt" },
    ],
    assertions: [
      { id: "a", type: "semantic", rubric: "criterion a", turn_ids: ["turn-1", "turn-3"] },
      { id: "b", type: "semantic", rubric: "criterion b", turn_ids: ["turn-1", "turn-3"] },
    ],
  }));
  await writeFile(resolve(run, "objective-grade.json"), JSON.stringify({ objective_pass: true, assertions: [] }));
  await writeFile(resolve(run, "transcript.json"), JSON.stringify({
    turns: [
      { id: "turn-1", final_text: "first answer", workspace: { changed_paths: [], diff: "" } },
      { id: "turn-2", final_text: "undeclared secret answer", workspace: { changed_paths: ["secret"], diff: "SECRET DIFF" } },
      { id: "turn-3", final_text: "third answer", workspace: { changed_paths: ["allowed"], diff: "ALLOWED DIFF" } },
    ],
  }));
  const built = await buildSemanticPrompt(run);
  assert.deepEqual(built.evidence.selected_turn_ids, ["turn-1", "turn-3"]);
  assert.deepEqual(built.evidence.turns.map((turn) => turn.id), ["turn-1", "turn-3"]);
  assert.equal(built.prompt.includes("undeclared secret"), false);
  assert.equal(built.prompt.includes("SECRET DIFF"), false);
  assert.equal(built.prompt.includes("candidate"), false);
  assert.match(built.prompt, /first answer/);
  assert.match(built.prompt, /third answer/);
});

test("semantic evidence reads reject changed-path traversal", async (t) => {
  const run = await mkdtemp(resolve(tmpdir(), "freeflow-semantic-traversal-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await mkdir(resolve(run, "artifacts", "workspace"), { recursive: true });
  await writeFile(resolve(run, "metadata.json"), JSON.stringify({ variant: "subject", changed_paths: ["../secret.txt"] }));
  await writeFile(resolve(run, "inputs", "case.json"), JSON.stringify({ prompt: "x", assertions: [{ id: "quality", type: "semantic", rubric: "x" }] }));
  await writeFile(resolve(run, "objective-grade.json"), JSON.stringify({ objective_pass: true, assertions: [] }));
  await writeFile(resolve(run, "final.md"), "answer");
  await writeFile(resolve(run, "diff"), "");
  await writeFile(resolve(run, "artifacts", "secret.txt"), "must not be read");
  await assert.rejects(() => buildSemanticPrompt(run), /changed evidence path.*escapes/i);
});

test("semantic protocol rejects extra, missing, duplicate, or inconsistent assertions", () => {
  const valid = { verdict: "pass", assertions: [{ id: "quality", verdict: "pass", evidence: ["Observed fact"] }], uncertainty: null };
  assert.equal(validateSemanticResult(valid, ["quality"]), valid);
  assert.throws(() => validateSemanticResult({ ...valid, assertions: [...valid.assertions, { id: "objective-check", verdict: "pass", evidence: ["x"] }] }, ["quality"]), /do not match/);
  assert.throws(() => validateSemanticResult({ ...valid, assertions: [] }, ["quality"]), /do not match/);
  assert.throws(() => validateSemanticResult({ ...valid, assertions: [...valid.assertions, ...valid.assertions] }, ["quality"]), /duplicate/);
  assert.throws(() => validateSemanticResult({ ...valid, verdict: "fail" }, ["quality"]), /conflicts/);
});

test("semantic post-process and cleanup failures preserve settled execution", async (t) => {
  const run = await mkdtemp(resolve(tmpdir(), "freeflow-semantic-outcome-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await mkdir(resolve(run, "artifacts", "workspace"), { recursive: true });
  await writeFile(resolve(run, "metadata.json"), JSON.stringify({ variant: "subject", changed_paths: [] }));
  await writeFile(resolve(run, "inputs", "case.json"), JSON.stringify({ prompt: "x", assertions: [{ id: "quality", type: "semantic", rubric: "x" }] }));
  await writeFile(resolve(run, "objective-grade.json"), JSON.stringify({ objective_pass: true, assertions: [] }));
  await writeFile(resolve(run, "final.md"), `answer ${"x".repeat(2000)}`);
  await writeFile(resolve(run, "diff"), "");
  const outcome = await gradeSemanticRun(run, {
    provider: "p",
    model: "m",
    thinking: "low",
    max_turns_per_process: 2,
    timeout_ms: 1000,
    output_limit_bytes: 1048576,
  }, {
    runSubject: async () => ({
      process: { code: 0, signal: null, timed_out: false, output_limit_exceeded: false, stdout: "", stderr: "" },
      parsed: {
        parse_errors: [],
        final_text: JSON.stringify({ verdict: "pass", assertions: [{ id: "quality", verdict: "pass", evidence: ["answer"] }], uncertainty: null }),
        usage: { input: 3, output: 2, total_tokens: 5, cost: { total_usd: 0.2 } },
      },
      runtime_counters: { provider_requests: 1, turns_started: 1, tool_calls: 0, hard_turn_limit_reached: false },
    }),
    persistEvidence: async () => { throw new Error("semantic evidence write failed"); },
    cleanup: async (path) => { await rm(path, { recursive: true, force: true }); throw new Error("semantic cleanup failed"); },
  });
  assert.equal(outcome.status, "incomplete");
  assert.equal(outcome.execution.runtime_counters.provider_requests, 1);
  assert.equal(outcome.execution.usage.cost.total_usd, 0.2);
  assert.match(outcome.failure.primary, /evidence write failed/);
  assert.match(outcome.failure.cleanup, /cleanup failed/);
  const packet = JSON.parse(await readFile(resolve(run, "semantic-packet.json"), "utf8"));
  const packetView = JSON.parse(await readFile(resolve(run, "semantic-packet-view.json"), "utf8"));
  const compactPacket = await readFile(resolve(run, "semantic-packet.cev1"), "utf8");
  assert.equal(packet.schema_version, 1);
  assert.equal(packetView.format, "cev1");
  assert.match(compactPacket, /^H\|CEV1\|/);
  assert.equal(JSON.stringify(packet).includes('"subject"'), false);
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
