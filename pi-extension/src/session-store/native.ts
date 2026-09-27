import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { MAX_READER_RESPONSE_BYTES } from "../tool-runtime/results/contracts.js";
import { isStoreIdentifier, type StoreFence, type StoreManifest } from "./contracts.js";
import { JournalError } from "./journal.js";
import { readManifest } from "./manifest.js";
import { SessionStoreRuntime } from "./store.js";

export type NativeStoreBinding = Readonly<{
  store: SessionStoreRuntime;
  fence: StoreFence;
  manifest: StoreManifest;
}>;

type Current = NativeStoreBinding & Readonly<{ sessionFile: string }>;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function v2StoreLimits(maxStoredBytes: number) {
  return {
    perArtifactBytes: maxStoredBytes,
    perRunBytes: maxStoredBytes,
    perSessionBytes: maxStoredBytes,
    totalBytes: maxStoredBytes,
    maxReadBytes: MAX_READER_RESPONSE_BYTES,
  };
}

/** One writer for one native session. Request assembly reads only this in-memory status. */
export class NativeSessionStore {
  private current?: Current;
  private issue?: string;
  private lane: Promise<void> = Promise.resolve();

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.lane.then(work, work);
    this.lane = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private fail(error: unknown): void {
    this.issue = error instanceof JournalError ? error.code : "store_unavailable";
  }

  async open(ctx: any, maxStoredBytes: number): Promise<void> {
    await this.close();
    const manager = ctx?.sessionManager;
    const sessionId = manager?.getSessionId?.();
    const file = manager?.getSessionFile?.();
    if (
      !isStoreIdentifier(sessionId) ||
      typeof file !== "string" ||
      !file ||
      !Number.isSafeInteger(maxStoredBytes) ||
      maxStoredBytes < 4 * 1024 * 1024
    ) {
      this.issue = "store_identity_unavailable";
      return;
    }
    const sessionFile = resolve(file);
    const root = join(dirname(sessionFile), "freeflow-session-store", "v2", digest(sessionId));
    let store: SessionStoreRuntime | undefined;
    let fence: StoreFence | undefined;
    try {
      const prior = await readManifest(root);
      const packageInfo = JSON.parse(await readFile(new URL("../../../package.json", import.meta.url), "utf8"));
      if (typeof packageInfo.name !== "string" || typeof packageInfo.version !== "string")
        throw new JournalError("package_identity", "V2 store package identity is unavailable.");
      const manifest: StoreManifest = prior ?? {
        schemaVersion: 2,
        storeId: `store:${randomUUID()}`,
        originSessionId: sessionId,
        host: { id: "pi", contract: "0.87.x" },
        createdBy: { package: packageInfo.name, version: packageInfo.version },
        domains: { execution: { schema: 1 }, guidance: { schema: 1 } },
      };
      if (manifest.originSessionId !== sessionId) throw new JournalError("manifest_identity", "Store origin changed.");
      // Reuse the existing capture storage ceiling until a separate store policy is selected.
      store = new SessionStoreRuntime(root, manifest, v2StoreLimits(maxStoredBytes));
      fence = await store.open();
      this.current = { store, fence, manifest, sessionFile };
      this.issue = undefined;
      await this.ensureCurrent(ctx);
    } catch (error) {
      this.fail(error);
      if (store && fence) await store.close(fence).catch(() => store!.abandon());
      this.current = undefined;
    }
  }

  /** Invoke only at tool admission or explicit ancestry navigation, never per provider request. */
  ensureCurrent(ctx: any): Promise<NativeStoreBinding> {
    return this.serial(async () => {
      const current = this.current;
      const manager = ctx?.sessionManager;
      const leaf = manager?.getLeafId?.() ?? "root";
      if (
        !current ||
        this.issue ||
        manager?.getSessionId?.() !== current.fence.sessionId ||
        resolve(manager?.getSessionFile?.() ?? "") !== current.sessionFile ||
        !isStoreIdentifier(leaf) ||
        current.store.status().state !== "ready"
      ) {
        this.issue ??= "store_unavailable";
        throw new JournalError("store_unavailable", "V2 store has no current native session binding.");
      }
      if (leaf !== current.fence.branchAnchor) {
        try {
          const fence = await current.store.refreshBranch(current.fence, leaf);
          this.current = { ...current, fence };
        } catch (error) {
          this.fail(error);
          throw error;
        }
      }
      const bound = this.current!;
      return { store: bound.store, fence: bound.fence, manifest: bound.manifest };
    });
  }

  binding(): NativeStoreBinding | undefined {
    if (!this.current || this.issue || this.current.store.status().state !== "ready") return undefined;
    return { store: this.current.store, fence: this.current.fence, manifest: this.current.manifest };
  }

  status(): { state: "ready" | "unavailable"; reason?: string } {
    const current = this.binding();
    if (current) return { state: "ready" };
    return { state: "unavailable", ...(this.issue ? { reason: this.issue } : {}) };
  }

  async close(): Promise<void> {
    await this.serial(async () => {
      const current = this.current;
      this.current = undefined;
      if (!current) return;
      try {
        await current.store.close(current.fence);
      } catch (error) {
        this.fail(error);
        await current.store.abandon();
      }
    });
  }
}
