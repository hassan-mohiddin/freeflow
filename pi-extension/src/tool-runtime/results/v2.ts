import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { TextDecoder } from "node:util";

import {
  isArtifactDescriptor,
  isStoreIdentifier,
  type ArtifactDescriptor,
  type AncestrySnapshot,
  type StoreManifest,
} from "../../session-store/contracts.js";
import type { ArtifactLimits } from "../../session-store/artifacts.js";
import { readManifest } from "../../session-store/manifest.js";
import { SessionStoreRuntime } from "../../session-store/store.js";
import { piAncestrySnapshot } from "../../session-store/pi-ancestry.js";
import { activeReadOnlySessionBranch, readOnlySessionSnapshot } from "../../session-sources/read-only-session.js";
import type { ResultGrant } from "./contracts.js";
import type { ResultReadAccess } from "./runtime.js";

export const V2_ARTIFACT_ENTRY = "freeflow-tool-artifact-v2";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const MAX_V2_READ_BYTES = 32_768;
const DEFAULT_V2_READ_BYTES = 8_192;

export type V2NativeCapture = Readonly<{
  assistantEntryId: string;
  toolCallId: string;
  toolName: "bash";
  emissionSha256: string;
  externalCoverage: "limited" | "unspecified";
  scope: "tool-result-hook";
}>;

export type V2ArtifactAnchor = Readonly<{
  version: 1;
  id: string;
  storeId: string;
  originSessionId: string;
  occurrenceId: string;
  domain: "execution" | "guidance";
  artifactSha256: string;
  bytes: number;
  native?: V2NativeCapture;
}>;

export class V2ResultError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "V2ResultError";
  }
}

export function isV2ArtifactAnchor(value: unknown): value is V2ArtifactAnchor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const required = ["version", "id", "storeId", "originSessionId", "occurrenceId", "domain", "artifactSha256", "bytes"];
  const hasNative = Object.hasOwn(item, "native");
  return (
    Object.keys(item).length === required.length + (hasNative ? 1 : 0) &&
    required.every((key) => Object.hasOwn(item, key)) &&
    item.version === 1 &&
    typeof item.id === "string" &&
    /^artifact:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item.id) &&
    isStoreIdentifier(item.storeId) &&
    isStoreIdentifier(item.originSessionId) &&
    isStoreIdentifier(item.occurrenceId) &&
    ["execution", "guidance"].includes(item.domain as string) &&
    typeof item.artifactSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(item.artifactSha256) &&
    Number.isSafeInteger(item.bytes) &&
    (item.bytes as number) > 0 &&
    (!hasNative ||
      (item.native !== undefined &&
        typeof item.native === "object" &&
        !Array.isArray(item.native) &&
        Object.keys(item.native).length === 6 &&
        ["assistantEntryId", "toolCallId", "toolName", "emissionSha256", "externalCoverage", "scope"].every((key) =>
          Object.hasOwn(item.native as object, key),
        ) &&
        isStoreIdentifier((item.native as any).assistantEntryId) &&
        typeof (item.native as any).toolCallId === "string" &&
        (item.native as any).toolCallId.length > 0 &&
        (item.native as any).toolCallId.length <= 4096 &&
        (item.native as any).toolName === "bash" &&
        typeof (item.native as any).emissionSha256 === "string" &&
        /^[a-f0-9]{64}$/.test((item.native as any).emissionSha256) &&
        ["limited", "unspecified"].includes((item.native as any).externalCoverage) &&
        (item.native as any).scope === "tool-result-hook"))
  );
}

export function anchorFor(
  descriptor: ArtifactDescriptor,
  manifest: StoreManifest,
  native?: V2NativeCapture,
): V2ArtifactAnchor {
  if (
    !isArtifactDescriptor(descriptor) ||
    !isV2ArtifactAnchor({
      version: 1,
      id: descriptor.id,
      storeId: manifest.storeId,
      originSessionId: manifest.originSessionId,
      occurrenceId: descriptor.occurrenceId,
      domain: descriptor.domain,
      artifactSha256: descriptor.sha256,
      bytes: descriptor.bytes,
      ...(native ? { native } : {}),
    })
  )
    throw new V2ResultError("artifact_invalid", "Artifact cannot be anchored under this store identity.");
  return {
    version: 1,
    id: descriptor.id,
    storeId: manifest.storeId,
    originSessionId: manifest.originSessionId,
    occurrenceId: descriptor.occurrenceId,
    domain: descriptor.domain as "execution" | "guidance",
    artifactSha256: descriptor.sha256,
    bytes: descriptor.bytes,
    ...(native ? { native } : {}),
  };
}

export async function openLocalOrigin(
  anchor: V2ArtifactAnchor,
  ctx: any,
  limits: ArtifactLimits,
): Promise<SessionStoreRuntime> {
  const file = ctx?.sessionManager?.getSessionFile?.();
  if (typeof file !== "string" || !file)
    throw new V2ResultError("origin_unavailable", "Persistent native session path is unavailable.");
  const base = dirname(resolve(file));
  const parts = [
    join(base, "freeflow-session-store"),
    join(base, "freeflow-session-store", "v2"),
    join(base, "freeflow-session-store", "v2", digest(anchor.originSessionId)),
  ];
  for (const path of parts) {
    const info = await lstat(path).catch(() => undefined);
    if (!info || info.isSymbolicLink() || !info.isDirectory())
      throw new V2ResultError("origin_unavailable", "Artifact origin store is unavailable at this storage root.");
  }
  let manifest: StoreManifest | undefined;
  try {
    manifest = await readManifest(parts.at(-1)!);
  } catch {
    throw new V2ResultError("origin_unavailable", "Artifact origin manifest is unavailable.");
  }
  if (!manifest || manifest.storeId !== anchor.storeId || manifest.originSessionId !== anchor.originSessionId)
    throw new V2ResultError("origin_unavailable", "Artifact origin identity is unavailable.");
  const store = new SessionStoreRuntime(parts.at(-1)!, manifest, limits);
  try {
    await store.openReadOnly();
  } catch {
    throw new V2ResultError("origin_unavailable", "Artifact origin cannot be verified for a read.");
  }
  return store;
}

export type V2ReadValue = Readonly<{
  id: string;
  data: string;
  encoding: "utf-8" | "base64";
  mediaType: string;
  range: Readonly<{ startBytes: number; endBytes: number }>;
  totalBytes: number;
  sha256: string;
  artifactSha256: string;
  coverage: ArtifactDescriptor["coverage"];
  sourceObservation?: ArtifactDescriptor["sourceObservation"];
  nextOffsetBytes?: number;
}>;

export type V2OriginPort = (anchor: V2ArtifactAnchor, ctx: any) => Promise<SessionStoreRuntime>;
type V2Source = {
  anchor: V2ArtifactAnchor;
  ancestry: AncestrySnapshot;
};

export class V2ArtifactReader {
  constructor(private readonly origin: V2OriginPort) {}

  private async source(id: string, ctx: any): Promise<V2Source> {
    const manager = ctx?.sessionManager;
    const sessionId = manager?.getSessionId?.();
    const sessionFile = manager?.getSessionFile?.();
    const leaf = manager?.getLeafId?.();
    const live = manager?.getBranch?.();
    if (
      !isStoreIdentifier(sessionId) ||
      typeof sessionFile !== "string" ||
      !sessionFile ||
      !Array.isArray(live) ||
      (leaf !== null && !isStoreIdentifier(leaf))
    )
      throw new V2ResultError("result_unavailable", "Native session ancestry is unavailable.");
    let persisted;
    try {
      const snapshot = await readOnlySessionSnapshot(sessionFile);
      if (snapshot.sessionId !== sessionId) throw new Error("session identity changed");
      persisted = activeReadOnlySessionBranch(snapshot, leaf);
    } catch {
      throw new V2ResultError("result_unavailable", "Native artifact ancestry is not persisted and verifiable.");
    }
    if (persisted.length !== live.length || persisted.some((entry, index) => entry.id !== live[index]?.id))
      throw new V2ResultError("result_unavailable", "Native artifact ancestry changed during resolution.");
    const matches = persisted.filter(
      (entry) =>
        entry.type === "custom" &&
        (entry as any).customType === V2_ARTIFACT_ENTRY &&
        (entry as any).data?.id === id &&
        isV2ArtifactAnchor((entry as any).data),
    );
    if (matches.length !== 1)
      throw new V2ResultError("result_unavailable", "Artifact anchor is unavailable or ambiguous.");
    const anchor = (matches[0] as any).data as V2ArtifactAnchor;
    if (anchor.native) {
      const assistantIndex = persisted.findIndex((entry) => entry.id === anchor.native!.assistantEntryId);
      const anchorIndex = persisted.findIndex((entry) => entry.id === matches[0].id);
      const assistant = persisted[assistantIndex] as any;
      const calls = (assistant?.message?.content ?? []).filter(
        (block: any) => block?.type === "toolCall" && block.id === anchor.native!.toolCallId && block.name === "bash",
      );
      const results = persisted
        .slice(anchorIndex + 1)
        .filter(
          (entry: any) =>
            entry.type === "message" &&
            entry.message?.role === "toolResult" &&
            entry.message.toolCallId === anchor.native!.toolCallId &&
            entry.message.toolName === "bash",
        );
      const final = (results[0] as any)?.message;
      const content = final?.content;
      if (
        assistantIndex < 0 ||
        assistantIndex >= anchorIndex ||
        calls.length !== 1 ||
        results.length !== 1 ||
        final?.isError !== false ||
        !Array.isArray(content) ||
        content.length !== 1 ||
        content[0]?.type !== "text" ||
        typeof content[0].text !== "string" ||
        digest(content[0].text) !== anchor.native.emissionSha256
      )
        throw new V2ResultError(
          "source_representation_changed",
          "Final native result differs from the captured emission.",
        );
    }
    return { anchor, ancestry: piAncestrySnapshot(sessionId, leaf ?? "root", persisted) };
  }

  private async verified(
    id: string,
    range: { startBytes: number; endBytes: number },
    ctx: any,
    access: ResultReadAccess,
    source: V2Source,
  ): Promise<{ bytes: Uint8Array; descriptor: ArtifactDescriptor; sha256: string }> {
    const { anchor, ancestry } = source;
    if (access.recovery && access.sha256 !== anchor.artifactSha256)
      throw new V2ResultError("result_not_admitted", "Artifact is not granted for attached recovery.");
    const store = await this.origin(anchor, ctx);
    if (anchor.native) {
      const events = await store.replay("execution", { ...ancestry, sessionId: anchor.originSessionId });
      const captures = events.filter((event) => {
        const payload = event.payload as any;
        return (
          event.kind === "native-capture" &&
          event.artifactRefs.length === 1 &&
          event.artifactRefs[0] === id &&
          payload?.artifactId === id &&
          payload?.assistantEntryId === anchor.native!.assistantEntryId &&
          payload?.toolCallId === anchor.native!.toolCallId &&
          payload?.toolName === "bash" &&
          payload?.bodySha256 === anchor.artifactSha256 &&
          payload?.emittedSha256 === anchor.native!.emissionSha256 &&
          payload?.externalCoverage === anchor.native!.externalCoverage
        );
      });
      if (captures.length !== 1)
        throw new V2ResultError("result_unavailable", "Native capture event is not acknowledged on ancestry.");
    }
    const result = await store.readArtifact(id, range, {
      ancestry,
      originSessionId: anchor.originSessionId,
      grantedArtifactIds: [id],
    });
    const descriptor = result.descriptor;
    if (
      descriptor.id !== anchor.id ||
      descriptor.sha256 !== anchor.artifactSha256 ||
      descriptor.bytes !== anchor.bytes ||
      descriptor.occurrenceId !== anchor.occurrenceId ||
      descriptor.domain !== anchor.domain ||
      (anchor.native &&
        (descriptor.coverage.boundary !== "tool-result-hook" ||
          descriptor.coverage.capture !== (anchor.native.externalCoverage === "limited" ? "limited" : "unknown") ||
          descriptor.origin.nativeEntryId !== anchor.native.assistantEntryId))
    )
      throw new V2ResultError("source_changed", "Artifact descriptor differs from the native anchor.");
    const manager = ctx?.sessionManager;
    if (
      manager?.getSessionId?.() !== ancestry.sessionId ||
      (manager?.getLeafId?.() ?? "root") !== ancestry.branchAnchor
    )
      throw new V2ResultError("result_unavailable", "Native ancestry changed during artifact recovery.");
    return { bytes: result.bytes, descriptor, sha256: result.sha256 };
  }

  async resolveGrant(id: string, ctx: any): Promise<ResultGrant | undefined> {
    try {
      const source = await this.source(id, ctx);
      await this.verified(id, { startBytes: 0, endBytes: 0 }, ctx, { recovery: false }, source);
      return { id: source.anchor.id, sha256: source.anchor.artifactSha256 };
    } catch {
      return undefined;
    }
  }

  async readValue(
    input: { id: string; offsetBytes?: number; maxBytes?: number },
    signal: AbortSignal | undefined,
    ctx: any,
    access: ResultReadAccess,
  ): Promise<V2ReadValue> {
    if (signal?.aborted) throw new V2ResultError("cancelled", "Artifact read was cancelled.");
    const offsetBytes = input.offsetBytes ?? 0;
    const maxBytes = input.maxBytes ?? DEFAULT_V2_READ_BYTES;
    if (
      !Number.isSafeInteger(offsetBytes) ||
      offsetBytes < 0 ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 1 ||
      maxBytes > MAX_V2_READ_BYTES
    )
      throw new V2ResultError("invalid_range", "Artifact range is invalid or oversized.");
    const source = await this.source(input.id, ctx);
    if (offsetBytes > source.anchor.bytes) throw new V2ResultError("invalid_range", "Offset exceeds artifact bytes.");
    const range = { startBytes: offsetBytes, endBytes: Math.min(source.anchor.bytes, offsetBytes + maxBytes) };
    const { bytes, descriptor, sha256 } = await this.verified(input.id, range, ctx, access, source);
    if (signal?.aborted) throw new V2ResultError("cancelled", "Artifact read was cancelled.");
    let encoding: "utf-8" | "base64" = "base64";
    let data = Buffer.from(bytes).toString("base64");
    if (descriptor.encoding === "utf-8") {
      try {
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        if (Buffer.from(text, "utf8").equals(Buffer.from(bytes))) {
          encoding = "utf-8";
          data = text;
        }
      } catch {
        /* A byte range may split a code point; return exact base64 instead. */
      }
    }
    return {
      id: descriptor.id,
      data,
      encoding,
      mediaType: descriptor.mediaType,
      range,
      totalBytes: descriptor.bytes,
      sha256,
      artifactSha256: descriptor.sha256,
      coverage: descriptor.coverage,
      ...(descriptor.sourceObservation ? { sourceObservation: descriptor.sourceObservation } : {}),
      ...(range.endBytes < descriptor.bytes ? { nextOffsetBytes: range.endBytes } : {}),
    };
  }
}
