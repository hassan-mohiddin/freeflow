import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { hashDirectory } from "../../../skills/evaluate-skill/scripts/lib/hash.mjs";
import { makeWritable } from "../../../skills/evaluate-skill/scripts/lib/materialize.mjs";
import { runPlan } from "../../../skills/evaluate-skill/scripts/lib/run.mjs";
import { applyEscalation, loadWave } from "../../../skills/evaluate-skill/scripts/lib/wave.mjs";

function fakePlan() {
  const baseJob = (caseId) => ({
    case_id: caseId,
    eval_case: { prompt: "x", execution: { timeout_ms: 1000 } },
    variant: { id: "candidate", kind: "none", snapshot_hash: null },
    model_required: true,
    fingerprint: caseId.toLowerCase().padEnd(64, "a").slice(0, 64),
  });
  return {
    runnable: true,
    unresolved_owner_inputs: [],
    skill: "sample-skill",
    profile: "iterate",
    jobs: [baseJob("CASE-A"), baseJob("CASE-B")],
  };
}

test("loading an interrupted wave requires explicit retry", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-wave-interrupt-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const waveRoot = resolve(root, "wave");
  await mkdir(waveRoot);
  await writeFile(resolve(waveRoot, "wave.json"), `${JSON.stringify({
    schema_version: 1,
    wave_id: "interrupted-wave",
    wave_root: waveRoot,
    plan: {},
    jobs: [{ status: "running" }],
  })}\n`);

  const wave = await loadWave(waveRoot);

  assert.equal(wave.jobs[0].status, "needs-attention");
  assert.equal(wave.jobs[0].interrupted_before_resume, true);
  assert.match(wave.jobs[0].error, /retry-needs-attention/);
});

test("soft cap pauses after active job and owner escalation resumes pending work", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-wave-test-"));
  t.after(async () => {
    await makeWritable(root);
    await rm(root, { recursive: true, force: true });
  });
  const skillRoot = resolve(root, ".skill-eval", "sample-skill");
  await mkdir(skillRoot, { recursive: true });
  const workspace = {
    repoRoot: root,
    skillRoot,
    suite: { skill: "sample-skill", profiles: { iterate: { max_repeats: 0 } } },
  };
  const fixture = resolve(root, "source-fixture");
  await mkdir(fixture);
  await writeFile(resolve(fixture, "value.txt"), "frozen\n");
  const plan = fakePlan();
  const fixtureHash = await hashDirectory(fixture);
  for (const job of plan.jobs) {
    job.fixture_path = fixture;
    job.fixture_hash = fixtureHash;
  }
  const calls = [];
  const observedFixtures = [];
  const execute_job = async (_workspace, job, options) => {
    calls.push(job.case_id);
    observedFixtures.push(await readFile(resolve(options.frozen_fixture_path, "value.txt"), "utf8"));
    return {
      reused: false,
      run_dir: resolve(root, job.case_id),
      runtime_verdict: "pass",
      provider_requests: 2,
      usage: { cost: { total_usd: 0.1 } },
      model_driven: true,
    };
  };

  const first = await runPlan(workspace, plan, {
    max_model_requests: 1,
    max_turns_per_job: 4,
    max_usd: 1,
    concurrency: 1,
    execute_job,
  });
  assert.equal(first.status, "paused_budget");
  assert.deepEqual(calls, ["CASE-A"]);
  assert.equal(first.jobs[0].status, "complete");
  assert.equal(first.jobs[1].status, "pending");
  assert.equal(first.budget.model_requests, 2);

  await writeFile(resolve(fixture, "value.txt"), "mutated-after-pause\n");
  const wave = await loadWave(first.wave_dir);
  const second = await runPlan(workspace, wave.plan, {
    wave,
    max_model_requests: 4,
    concurrency: 1,
    execute_job,
  });
  assert.equal(second.status, "complete");
  assert.deepEqual(calls, ["CASE-A", "CASE-B"]);
  assert.deepEqual(observedFixtures, ["frozen\n", "frozen\n"]);
  assert.equal(second.jobs.every((job) => job.status === "complete"), true);
  assert.equal(second.budget.model_requests, 4);
});

test("hard-limit job requires explicit retry on resume", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-wave-retry-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, ".skill-eval", "sample-skill");
  await mkdir(skillRoot, { recursive: true });
  const workspace = { repoRoot: root, skillRoot, suite: { skill: "sample-skill", profiles: { iterate: { max_repeats: 1 } } } };
  const plan = { ...fakePlan(), jobs: [fakePlan().jobs[0]] };
  let attempt = 0;
  const execute_job = async () => {
    attempt += 1;
    return {
      reused: false,
      run_dir: resolve(root, `attempt-${attempt}`),
      runtime_verdict: attempt === 1 ? "infrastructure-error" : "pass",
      provider_requests: 1,
      usage: { cost: { total_usd: 0.1 } },
      model_driven: true,
    };
  };
  const first = await runPlan(workspace, plan, { max_model_requests: 4, max_turns_per_job: 2, concurrency: 1, execute_job });
  assert.equal(first.status, "needs_attention");
  const wave = await loadWave(first.wave_dir);
  const second = await runPlan(workspace, wave.plan, { wave, retry_needs_attention: true, execute_job });
  assert.equal(second.status, "complete");
  assert.equal(attempt, 2);
});

test("raising a hard limit gives pending work a new fingerprint", () => {
  const inputs = { hard_limits: { max_turns_per_job: 2, output_limit_bytes: 1024 }, case: { id: "X" } };
  const wave = {
    policy: { max_model_requests: 4, max_turns_per_job: 2, output_limit_bytes: 1024, max_usd: 1, concurrency: 1 },
    plan: { jobs: [{ fingerprint_inputs: inputs, fingerprint: "old" }], expected_model_jobs: { subject: 1 }, model_request_bounds: { subject_max: 2 } },
    jobs: [{ index: 0, status: "needs-attention", verdicts: ["infrastructure-error"] }],
    pause_reason: "hard limit",
  };
  applyEscalation(wave, { output_limit_bytes: 2048 });
  assert.notEqual(wave.plan.jobs[0].fingerprint, "old");
  assert.equal(wave.plan.jobs[0].fingerprint_inputs.hard_limits.output_limit_bytes, 2048);
  assert.deepEqual(wave.jobs[0].verdicts, []);
  assert.equal(wave.jobs[0].configuration_escalations.length, 1);
});

test("resume refuses cap reduction", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-wave-cap-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skillRoot = resolve(root, ".skill-eval", "sample-skill");
  await mkdir(skillRoot, { recursive: true });
  const workspace = { repoRoot: root, skillRoot, suite: { skill: "sample-skill", profiles: { iterate: { max_repeats: 0 } } } };
  const first = await runPlan(workspace, { ...fakePlan(), jobs: [] }, { max_model_requests: 4, max_turns_per_job: 4, concurrency: 1, execute_job: async () => null });
  const wave = await loadWave(first.wave_dir);
  await assert.rejects(() => runPlan(workspace, wave.plan, { wave, max_model_requests: 3, execute_job: async () => null }), /only be raised/);
});
