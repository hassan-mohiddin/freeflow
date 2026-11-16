import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { freeflowHome } from "../messaging/registry.js";
import type { Run } from "../store/layer.js";

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
const storeHere = (): boolean => existsSync(join(resolve(freeflowHome()), "store.json"));

export class DiscussionCapture {
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private capturing: Promise<void> = Promise.resolve();

  constructor(private readonly run: Run) {}

  /** A run settled: the capture runs once the session has stayed idle a moment. */
  settled(): void {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      void this.capture();
    }, CAPTURE_IDLE_MS);
    this.idleTimer.unref?.();
  }

  /** A run starts: no capture in the middle of it. */
  runStarted(): void {
    this.cancelIdle();
  }

  /** Captures the turn's messages now, after any capture still running. */
  capture(): Promise<void> {
    this.cancelIdle();
    this.capturing = this.capturing.then(() => this.once());
    return this.capturing;
  }

  private async once(): Promise<void> {
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

  private cancelIdle(): void {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}
