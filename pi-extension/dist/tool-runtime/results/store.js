import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, readdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonical } from "../../cognitive-routing-v2/types.js";
import { CAPTURE_DESCRIPTOR_ENTRY, MAX_CAPTURE_BYTES } from "./contracts.js";
import { sha256 } from "./presentation.js";
export class CaptureStoreError extends Error {
  code;
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "CaptureStoreError";
  }
}
function sessionFacts(ctx) {
  const sessionFile = ctx?.sessionManager?.getSessionFile?.();
  const sessionId = ctx?.sessionManager?.getSessionId?.();
  if (typeof sessionFile !== "string" || !sessionFile || typeof sessionId !== "string" || !sessionId) {
    throw new CaptureStoreError("reader_unavailable", "Persistent native session storage is unavailable.");
  }
  return { sessionFile: resolve(sessionFile), sessionId };
}
function namespaceParts(ctx, originSessionId) {
  const { sessionFile } = sessionFacts(ctx);
  const base = dirname(sessionFile);
  return [
    join(base, "freeflow-results"),
    join(base, "freeflow-results", "v1"),
    join(base, "freeflow-results", "v1", sha256(originSessionId)),
  ];
}
function namespaceRoot(ctx, originSessionId) {
  return namespaceParts(ctx, originSessionId).at(-1);
}
async function verifiedNamespace(ctx, originSessionId, create) {
  const parts = namespaceParts(ctx, originSessionId);
  for (const part of parts) {
    let value;
    try {
      value = await lstat(part);
    } catch (error) {
      if (error?.code !== "ENOENT" || !create) {
        throw new CaptureStoreError("artifact_missing", "Captured-result namespace is unavailable.");
      }
      try {
        await mkdir(part, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
      }
      value = await lstat(part);
    }
    if (value.isSymbolicLink() || !value.isDirectory()) {
      throw new CaptureStoreError("artifact_invalid", "Captured-result namespace is not a real directory.");
    }
    if (create) await chmod(part, 0o700);
  }
  return parts.at(-1);
}
function capturePath(ctx, descriptor) {
  if (!/^[a-f0-9]{64}\.txt$/.test(descriptor.storageKey)) {
    throw new CaptureStoreError("result_unavailable", "Captured result storage identity is invalid.");
  }
  const root = namespaceRoot(ctx, descriptor.originSessionId);
  const path = resolve(root, descriptor.storageKey);
  if (dirname(path) !== resolve(root)) {
    throw new CaptureStoreError("result_unavailable", "Captured result storage identity escapes its namespace.");
  }
  return path;
}
function signature(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":");
}
async function namespaceBytes(root) {
  let names;
  try {
    names = await readdir(root);
  } catch (error) {
    if (error?.code === "ENOENT") return 0;
    throw error;
  }
  let total = 0;
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.txt$/.test(name)) continue;
    try {
      const value = await lstat(join(root, name));
      if (value.isFile()) total += value.size;
    } catch {
      // A disappearing orphan does not count toward the next reservation.
    }
  }
  return total;
}
export class CaptureStore {
  pi;
  constructor(pi) {
    this.pi = pi;
  }
  async publish(ctx, descriptor, body, maximumStoredBytes, fence = () => true) {
    const { sessionId } = sessionFacts(ctx);
    if (!fence() || sessionId !== descriptor.originSessionId) {
      throw new CaptureStoreError("session_changed", "Capture session changed before publication.");
    }
    const bytes = Buffer.from(body, "utf8");
    if (bytes.length !== descriptor.capture.bytes || bytes.length > MAX_CAPTURE_BYTES) {
      throw new CaptureStoreError("capture_limit", "Captured result exceeds its declared byte boundary.");
    }
    const root = await verifiedNamespace(ctx, descriptor.originSessionId, true);
    const lockPath = join(root, ".capture-reservation");
    let reservation;
    try {
      try {
        reservation = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new CaptureStoreError(
            "storage_busy",
            "Captured-result storage is busy; native output is retained. If no other Freeflow process is active, remove the stale .capture-reservation file from this session's sidecar namespace.",
          );
        }
        throw error;
      }
      const used = await namespaceBytes(root);
      if (used + bytes.length > maximumStoredBytes) {
        throw new CaptureStoreError("storage_budget", "Captured-result storage budget is exhausted.");
      }
      const path = capturePath(ctx, descriptor);
      let file;
      try {
        file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
        await file.writeFile(bytes);
      } finally {
        await file?.close();
      }
      const verified = await this.read(ctx, descriptor);
      if (!verified.equals(bytes)) {
        throw new CaptureStoreError("artifact_changed", "Captured result changed during publication.");
      }
      if (!fence())
        throw new CaptureStoreError("session_changed", "Capture session changed before descriptor publication.");
      this.pi.appendEntry?.(CAPTURE_DESCRIPTOR_ENTRY, descriptor);
      const matches = (ctx.sessionManager.getBranch?.() ?? []).filter(
        (entry) =>
          entry?.type === "custom" &&
          entry.customType === CAPTURE_DESCRIPTOR_ENTRY &&
          entry.data?.id === descriptor.id &&
          canonical(entry.data) === canonical(descriptor),
      );
      if (matches.length !== 1) {
        throw new CaptureStoreError(
          "descriptor_unacknowledged",
          "Capture descriptor was not acknowledged on ancestry.",
        );
      }
    } finally {
      if (reservation) {
        await reservation.close();
        await unlink(lockPath).catch(() => {});
      }
    }
  }
  async read(ctx, descriptor) {
    await verifiedNamespace(ctx, descriptor.originSessionId, false);
    const path = capturePath(ctx, descriptor);
    let link;
    try {
      link = await lstat(path);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new CaptureStoreError("artifact_missing", "Captured result file is missing.");
      }
      throw error;
    }
    if (link.isSymbolicLink() || !link.isFile()) {
      throw new CaptureStoreError("artifact_invalid", "Captured result is not a regular file.");
    }
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    let file;
    try {
      file = await open(path, constants.O_RDONLY | noFollow);
      const before = await file.stat();
      if (!before.isFile() || before.size !== descriptor.capture.bytes || before.size > MAX_CAPTURE_BYTES) {
        throw new CaptureStoreError("artifact_changed", "Captured result size differs from its descriptor.");
      }
      const body = await file.readFile();
      const after = await file.stat();
      if (signature(before) !== signature(after) || body.length !== before.size) {
        throw new CaptureStoreError("artifact_changed", "Captured result changed during readback.");
      }
      if (sha256(body) !== descriptor.capture.sha256) {
        throw new CaptureStoreError("artifact_changed", "Captured result integrity check failed.");
      }
      return body;
    } catch (error) {
      if (error instanceof CaptureStoreError) throw error;
      throw new CaptureStoreError("artifact_read_failed", "Captured result file could not be read.");
    } finally {
      await file?.close();
    }
  }
}
