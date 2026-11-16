import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { freeflowHome } from "../messaging/registry.js";
/**
 * Freeflow's discussion capture on Pi (D-056): after a run settles, Track Work's `discussion capture` keeps the turn's
 * user messages, word for word, in the held task's discussions/ (or in the session's own file while it holds no task).
 * The capture runs once the session has stayed idle a moment, as the event log's flush does, so starting the script
 * never lands in a run; a run that starts first cancels it, and shutdown captures what is left. It names this session
 * and its transcript itself, and commits without pushing; a capture that stored something then pushes once, so the
 * turn makes one push at most. No store, no capture. The script reads the transcript from its cursor, so a capture
 * that fails is made again by the next one. Never throws.
 */
export const CAPTURE_IDLE_MS = 2_000;
const CAPTURE_MS = 30_000;
/** The store marks itself with store.json at its root (Track Work's store). */
const storeHere = () => existsSync(join(resolve(freeflowHome()), "store.json"));
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
      const session = process.env.FREEFLOW_SESSION;
      const transcript = process.env.FREEFLOW_TRANSCRIPT;
      if (!storeHere() || !session || !transcript) return;
      const ran = await this.run(
        ["discussion", "capture", "--no-push", "--session", session, "--transcript", transcript],
        { timeoutMs: CAPTURE_MS },
      );
      // Only a capture that stored something pushes, once, after it.
      if (ran.code === 0 && ran.stdout.startsWith("Captured"))
        await this.run(["store", "sync"], { timeoutMs: CAPTURE_MS });
    } catch {
      // A capture that fails leaves its messages to the next one, which reads the transcript from the cursor again.
    }
  }
  cancelIdle() {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}
