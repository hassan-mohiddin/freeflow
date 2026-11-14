/**
 * Freeflow's discussion capture on Pi (D-056): after a run settles, Track Work's `discussion capture` keeps the turn's
 * user messages, word for word, in the held task's discussions/ (or in the session's own file while it holds no task).
 * The capture runs once the session has stayed idle a moment, as the event log's flush does, so starting the script
 * never lands in a run; a run that starts first cancels it, and shutdown captures what is left. The script reads the
 * transcript from its own cursor, so a capture that fails is simply made again by the next one. Never throws.
 */
export const CAPTURE_IDLE_MS = 2_000;
const CAPTURE_MS = 30_000;
export class DiscussionCapture {
  run;
  idleTimer;
  capturing = Promise.resolve();
  constructor(run) {
    this.run = run;
  }
  /** A run settled: the capture runs once the session has stayed idle a moment. */
  settled() {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      void this.capture();
    }, CAPTURE_IDLE_MS);
    this.idleTimer.unref?.();
  }
  /** A run starts: no capture in the middle of it. */
  runStarted() {
    this.cancelIdle();
  }
  /** Captures the turn's messages now, after any capture still running. */
  capture() {
    this.cancelIdle();
    this.capturing = this.capturing.then(() => this.once());
    return this.capturing;
  }
  async once() {
    try {
      await this.run(["discussion", "capture"], { timeoutMs: CAPTURE_MS });
    } catch {
      // A capture that fails leaves its messages to the next one, which reads the transcript from the cursor again.
    }
  }
  cancelIdle() {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}
