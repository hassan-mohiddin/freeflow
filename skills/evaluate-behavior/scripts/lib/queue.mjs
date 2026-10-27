// Bounded queues for work the evaluator runs at once: subjects (model calls, `--jobs`) and local CPU work that is
// not a model call (`--cpu-jobs`), such as command graders and container work. Waiters start in arrival order.

/**
 * A FIFO limiter: `run(work)` starts `work` once fewer than `limit` are running. `peak` is the most that ever ran
 * at once, recorded so a test or a summary can show the bound held.
 *
 * @param {number} limit
 */
export function createLimiter(limit) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("a limiter needs a positive integer limit");
  const waiting = [];
  const state = { limit, active: 0, peak: 0 };
  // A freed slot passes straight to the next waiter, still counted as taken, so a start that arrives before the
  // waiter resumes finds no free slot and queues behind it.
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else state.active -= 1;
  };
  return {
    get limit() {
      return state.limit;
    },
    get active() {
      return state.active;
    },
    get peak() {
      return state.peak;
    },
    /** @template T @param {() => Promise<T>} work @returns {Promise<T>} */
    async run(work) {
      // A waiter resumes holding the slot its predecessor handed over; only a start with a free slot takes one.
      if (state.active >= state.limit) await new Promise((resolve) => waiting.push(resolve));
      else state.active += 1;
      state.peak = Math.max(state.peak, state.active);
      try {
        return await work();
      } finally {
        release();
      }
    },
  };
}

export const DEFAULT_CPU_JOBS = 2;
let cpu = createLimiter(DEFAULT_CPU_JOBS);

/** Sets how much local CPU work runs at once (`--cpu-jobs`); call before any work is queued. */
export function setCpuJobs(limit) {
  cpu = createLimiter(limit);
}

/** Runs `work` in the shared CPU queue, so graders and containers never exceed `--cpu-jobs` at once. */
export function withCpuSlot(work) {
  return cpu.run(work);
}
