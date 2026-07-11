export class SoftWaveBudget {
  constructor({ maxModelRequests, maxUsd = null, usage = {} }) {
    if (!Number.isInteger(maxModelRequests) || maxModelRequests < 1) throw new Error("maxModelRequests must be a positive integer");
    if (maxUsd !== null && (!(maxUsd >= 0) || !Number.isFinite(maxUsd))) throw new Error("maxUsd must be a non-negative number or null");
    this.maxModelRequests = maxModelRequests;
    this.maxUsd = maxUsd;
    this.modelRequests = usage.model_requests ?? 0;
    this.jobsCompleted = usage.jobs_completed ?? 0;
    this.spentUsd = usage.spent_usd ?? 0;
    this.costAvailable = usage.cost_available ?? true;
  }

  pauseReason() {
    if (this.modelRequests >= this.maxModelRequests) return `model-request cap reached: ${this.modelRequests}/${this.maxModelRequests}`;
    if (this.maxUsd !== null && this.costAvailable && this.spentUsd >= this.maxUsd) return `model-spend cap reached: ${this.spentUsd}/${this.maxUsd}`;
    return null;
  }

  canStartJob() {
    return this.pauseReason() === null;
  }

  recordJob({ providerRequests = 0, usage = null, costExpected = false } = {}) {
    this.jobsCompleted += 1;
    this.modelRequests += providerRequests;
    const cost = usage?.cost?.total_usd;
    if (typeof cost === "number") this.spentUsd += cost;
    else if (costExpected) this.costAvailable = false;
  }

  summary() {
    return {
      jobs_completed: this.jobsCompleted,
      model_requests: this.modelRequests,
      max_model_requests: this.maxModelRequests,
      spent_usd: this.costAvailable ? this.spentUsd : null,
      max_usd: this.maxUsd,
      cost_available: this.costAvailable,
      pause_reason: this.pauseReason(),
    };
  }
}

export async function runBounded(items, worker, concurrency) {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be a positive integer");
  const results = new Array(items.length);
  let next = 0;
  let peak = 0;
  let active = 0;

  async function consume() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      active += 1;
      peak = Math.max(peak, active);
      try {
        results[index] = await worker(items[index], index);
      } finally {
        active -= 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return { results, peak_concurrency: peak };
}

export function adaptiveRepeatDecision({ verdicts, repeatsUsed, maxRepeats }) {
  const distinct = new Set(verdicts.filter(Boolean));
  const inconclusive = distinct.has("inconclusive") || distinct.has("infrastructure-error");
  const conflict = distinct.has("pass") && distinct.has("fail");
  if (!inconclusive && !conflict) return { action: "stop", reason: "stable" };
  if (repeatsUsed < maxRepeats) return { action: "repeat", reason: conflict ? "conflict" : "inconclusive" };
  return { action: "stop", reason: "unresolved-variance-at-cap" };
}
