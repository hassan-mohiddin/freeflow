import type { OperationKey } from "./contracts.js";

export type ToolProgressPhase = "preparing" | "running" | "settling" | "cancelling";

export type ToolProgressCounts = Readonly<{
  submitted: number;
  started: number;
  succeeded: number;
  denied: number;
  failed: number;
  cancelled: number;
  unknown: number;
}>;

export type ToolProgressCurrent = Readonly<{
  seq?: number;
  operation: OperationKey;
  status: string;
  effect?: string;
  effectState?: string;
}>;

export type ToolProgressSnapshot = Readonly<{
  version: 1;
  tool: "freeflow_tools" | "freeflow_run" | "freeflow_result";
  phase: ToolProgressPhase;
  activity: string;
  runId?: string;
  counts?: ToolProgressCounts;
  emittedCount?: number;
  current?: ToolProgressCurrent;
}>;

export type ToolProgressUpdate = (result: {
  content: { type: "text"; text: string }[];
  details: { freeflowProgress: ToolProgressSnapshot };
}) => void;

function boundedActivity(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 240);
}

export function progressText(progress: ToolProgressSnapshot): string {
  const parts = [boundedActivity(progress.activity)];
  if (progress.counts) {
    const settled =
      progress.counts.succeeded +
      progress.counts.denied +
      progress.counts.failed +
      progress.counts.cancelled +
      progress.counts.unknown;
    parts.push(`${settled}/${progress.counts.submitted} calls settled`);
  }
  if (progress.emittedCount !== undefined) parts.push(`${progress.emittedCount} emitted`);
  if (progress.current) {
    parts.push(`${progress.current.operation.id}@${progress.current.operation.revision} · ${progress.current.status}`);
    if (progress.current.effectState) parts.push(`effect ${progress.current.effectState}`);
  }
  return parts.join(" · ");
}

function result(progress: ToolProgressSnapshot) {
  return {
    content: [{ type: "text" as const, text: progressText(progress) }],
    details: { freeflowProgress: progress },
  };
}

export class ToolProgressReporter {
  private pending: ToolProgressSnapshot | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastUpdateAt = 0;

  constructor(
    private readonly update: ToolProgressUpdate | undefined,
    private readonly minimumIntervalMs = 100,
  ) {}

  publish(progress: ToolProgressSnapshot, immediate = false): void {
    if (!this.update) return;
    this.pending = Object.freeze({
      ...progress,
      activity: boundedActivity(progress.activity),
      ...(progress.counts ? { counts: Object.freeze({ ...progress.counts }) } : {}),
      ...(progress.current
        ? {
            current: Object.freeze({
              ...progress.current,
              operation: Object.freeze({ ...progress.current.operation }),
            }),
          }
        : {}),
    });
    const delay = this.minimumIntervalMs - (Date.now() - this.lastUpdateAt);
    if (immediate || delay <= 0) {
      this.flush();
      return;
    }
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, delay);
  }

  flush(): void {
    if (!this.pending || !this.update) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const progress = this.pending;
    this.pending = undefined;
    this.lastUpdateAt = Date.now();
    try {
      this.update(result(progress));
    } catch {
      // Progress is diagnostic only. A renderer/update failure must not change tool execution semantics.
    }
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }
}
