import { appendFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { stableJson } from "../core/stable-json.js";
export class FileContextControlAuditSink {
  path;
  queue = Promise.resolve();
  constructor(path) {
    this.path = path;
  }
  async purge() {
    await this.queue;
    await rm(this.path, { force: true });
  }
  record(event) {
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
