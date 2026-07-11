import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { adaptiveRepeatDecision, SoftWaveBudget, runBounded } from "../../../skills/evaluate-skill/scripts/lib/scheduler.mjs";
import { readControlCache, writeControlCache } from "../../../skills/evaluate-skill/scripts/lib/cache.mjs";

test("bounded scheduler queues overflow", async () => {
  let active = 0;
  let observedPeak = 0;
  const wave = await runBounded([1, 2, 3, 4, 5], async (value) => {
    active += 1;
    observedPeak = Math.max(observedPeak, active);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
    active -= 1;
    return value * 2;
  }, 2);
  assert.deepEqual(wave.results, [2, 4, 6, 8, 10]);
  assert.equal(wave.peak_concurrency, 2);
  assert.equal(observedPeak, 2);
});

test("soft wave budget pauses only between jobs and labels unavailable cost", () => {
  const budget = new SoftWaveBudget({ maxModelRequests: 2, maxUsd: 1 });
  assert.equal(budget.canStartJob(), true);
  budget.recordJob({ providerRequests: 3, usage: { cost: null }, costExpected: true });
  assert.equal(budget.canStartJob(), false);
  assert.match(budget.pauseReason(), /model-request cap/);
  assert.equal(budget.summary().model_requests, 3);
  assert.equal(budget.summary().spent_usd, null);
  assert.equal(budget.summary().cost_available, false);
});

test("adaptive repeats are bounded", () => {
  assert.deepEqual(adaptiveRepeatDecision({ verdicts: ["inconclusive"], repeatsUsed: 0, maxRepeats: 1 }), { action: "repeat", reason: "inconclusive" });
  assert.deepEqual(adaptiveRepeatDecision({ verdicts: ["pass", "fail"], repeatsUsed: 1, maxRepeats: 1 }), { action: "stop", reason: "unresolved-variance-at-cap" });
  assert.deepEqual(adaptiveRepeatDecision({ verdicts: ["pass"], repeatsUsed: 0, maxRepeats: 2 }), { action: "stop", reason: "stable" });
});

test("control cache requires exact fingerprint and age", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "freeflow-cache-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fingerprint = "a".repeat(64);
  await writeControlCache(root, { fingerprint, created_at: "2026-07-10T00:00:00.000Z", run_dir: "/tmp/run", objective_verdict: "fail" });
  const hit = await readControlCache(root, fingerprint, { maxAgeHours: 24, now: Date.parse("2026-07-10T01:00:00.000Z") });
  assert.equal(hit.hit, true);
  assert.equal(hit.value.objective_verdict, "fail");
  assert.equal((await readControlCache(root, fingerprint, { maxAgeHours: 1, now: Date.parse("2026-07-12T00:00:00.000Z") })).reason, "expired");
  assert.equal((await readControlCache(root, "b".repeat(64))).reason, "missing");
});
