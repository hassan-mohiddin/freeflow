function boundedActivity(value) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 240);
}
export function progressText(progress) {
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
function result(progress) {
  return {
    content: [{ type: "text", text: progressText(progress) }],
    details: { freeflowProgress: progress },
  };
}
export class ToolProgressReporter {
  update;
  minimumIntervalMs;
  pending;
  timer;
  lastUpdateAt = 0;
  constructor(update, minimumIntervalMs = 100) {
    this.update = update;
    this.minimumIntervalMs = minimumIntervalMs;
  }
  publish(progress, immediate = false) {
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
  flush() {
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
  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }
}
