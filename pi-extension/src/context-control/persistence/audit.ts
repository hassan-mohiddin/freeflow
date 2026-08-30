import { appendFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { stableJson } from "../core/stable-json.js";
import type { ContextControlAuditEvent, ContextControlAuditSink } from "../core/types.js";

export class FileContextControlAuditSink implements ContextControlAuditSink {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  async purge(): Promise<void> {
    await this.queue;
    await rm(this.path, { force: true });
  }

  record(event: ContextControlAuditEvent): Promise<void> {
    const result = this.queue.then(
      async () => {
        await mkdir(dirname(this.path), { recursive: true });
        await appendFile(this.path, `${stableJson(event)}\n`, { encoding: "utf8", mode: 0o600 });
      },
      async () => {
        await mkdir(dirname(this.path), { recursive: true });
        await appendFile(this.path, `${stableJson(event)}\n`, { encoding: "utf8", mode: 0o600 });
      },
    );
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
