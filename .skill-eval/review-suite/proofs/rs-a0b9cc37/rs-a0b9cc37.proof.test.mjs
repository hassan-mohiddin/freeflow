// Proof probe for rs-a0b9cc37: the grader's evidence must report the objective result (objective_checks_passed)
// for every run shape, including multi-turn (rpc-scripted) runs. Run with EXPORT=<export root> node --test <file>
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const exportRoot = process.env.EXPORT;
const { buildSemanticPrompt } = await import(resolve(exportRoot, "skills/evaluate-skill/scripts/lib/semantic.mjs"));

async function multiTurnRun(t, objectivePass) {
  const run = await mkdtemp(resolve(tmpdir(), "rs-a0b9-proof-"));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(resolve(run, "inputs"), { recursive: true });
  await writeFile(
    resolve(run, "metadata.json"),
    JSON.stringify({ variant: "candidate", execution_mode: "rpc-scripted", changed_paths: [] }),
  );
  await writeFile(
    resolve(run, "inputs", "case.json"),
    JSON.stringify({
      turns: [{ id: "turn-1", prompt: "first prompt" }],
      assertions: [{ id: "quality", type: "semantic", rubric: "criterion", turn_ids: ["turn-1"] }],
    }),
  );
  await writeFile(
    resolve(run, "objective-grade.json"),
    JSON.stringify({ objective_pass: objectivePass, assertions: [] }),
  );
  await writeFile(
    resolve(run, "transcript.json"),
    JSON.stringify({
      turns: [{ id: "turn-1", final_text: "first answer", workspace: { changed_paths: [], diff: "" } }],
    }),
  );
  return run;
}

test("multi-turn diagnostic evidence reports a failed objective result as false", async (t) => {
  const run = await multiTurnRun(t, false);
  const built = await buildSemanticPrompt(run, { diagnostic: true });
  assert.equal(built.evidence.objective_checks_passed, false);
});

test("multi-turn evidence for a passing objective run reports true", async (t) => {
  const run = await multiTurnRun(t, true);
  const built = await buildSemanticPrompt(run);
  assert.equal(built.evidence.objective_checks_passed, true);
});
