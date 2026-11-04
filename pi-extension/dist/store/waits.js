/**
 * The Waits on row (SPEC-009 4.4), as Claude Code's mod gives it: when a delegation the current Slice waits on has
 * come back (its return or blocked line logged, or its return.md written), one row naming it, steered in at the next
 * turn boundary while the agent works, or starting a turn when it is idle and `delegation.wakeOnReturn` is on. Returns
 * within one 60-second window join one row; each return gives a row once. While a Slice waits on a delegation that has
 * not come back, the session's state is read again at a run's end and once a minute while idle, never per request.
 */
export const WAIT_BATCH_MS = 60_000;
export const WAITS_KEY = "freeflow-waits";
/** Whether a Slice waits on a delegation that has not come back yet. */
export function stillWaiting(state) {
  return Boolean(state?.waits?.delegations.some((each) => !each.returned));
}
export class WaitWatch {
  host;
  seen = new Set();
  timer;
  constructor(host) {
    this.host = host;
  }
  /** The row for the returns not yet named, marking them named; undefined when there are none. */
  rows(state) {
    const waits = state?.waits;
    if (!waits) return undefined;
    const back = waits.delegations.filter(
      (each) => each.returned && !this.seen.has(`${each.id} ${each.returned} ${each.at}`),
    );
    if (!back.length) return undefined;
    for (const each of back) this.seen.add(`${each.id} ${each.returned} ${each.at}`);
    return back
      .map((each) => `${each.id} returned (${each.returned}). ${waits.slice} waits on it: check it and close it.`)
      .join(" ");
  }
  /** A run ended: read the state again if a Slice still waits, deliver any row, and watch while idle. */
  async runEnded() {
    this.stop();
    const known = this.host.current();
    const state = stillWaiting(known) ? await this.host.refresh() : known;
    this.offer(state);
    if (stillWaiting(state)) this.watch();
  }
  /** A run started: the idle watch stops until it ends. */
  runStarted() {
    this.stop();
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  /** Forget what was named, at a new session. */
  reset() {
    this.stop();
    this.seen.clear();
  }
  offer(state) {
    const row = this.rows(state);
    if (row) this.host.deliver(`Freeflow: ${row}`, this.host.wakeOnReturn());
  }
  watch() {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.host
        .refresh()
        .then((state) => {
          this.offer(state);
          if (stillWaiting(state)) this.watch();
        })
        .catch(() => {});
    }, WAIT_BATCH_MS);
    this.timer.unref?.();
  }
}
