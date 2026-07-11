export class ModelBudget {
  constructor({ maxCalls, maxUsd = null }) {
    if (!Number.isInteger(maxCalls) || maxCalls < 0) throw new Error("maxCalls must be a non-negative integer");
    if (maxUsd !== null && (!(maxUsd >= 0) || !Number.isFinite(maxUsd))) throw new Error("maxUsd must be a non-negative number or null");
    this.maxCalls = maxCalls;
    this.maxUsd = maxUsd;
    this.calls = 0;
    this.spentUsd = 0;
    this.costAvailable = true;
  }

  reserveCall() {
    if (this.calls >= this.maxCalls) throw new Error(`Model-call cap reached: ${this.maxCalls}`);
    if (this.maxUsd !== null && this.costAvailable && this.spentUsd >= this.maxUsd) throw new Error(`Model-spend cap reached: ${this.maxUsd}`);
    this.calls += 1;
  }

  recordUsage(usage) {
    const cost = usage?.cost?.total_usd;
    if (typeof cost === "number") this.spentUsd += cost;
    else this.costAvailable = false;
  }

  summary() {
    return { calls: this.calls, max_calls: this.maxCalls, spent_usd: this.costAvailable ? this.spentUsd : null, max_usd: this.maxUsd, cost_available: this.costAvailable };
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
