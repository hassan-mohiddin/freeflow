import { randomUUID } from "node:crypto";

import type { StoreFence, StoreManifest, StoreJson } from "../../session-store/contracts.js";
import { canonicalStoreJson, storeDigest } from "../../session-store/journal.js";
import type { SessionStoreRuntime } from "../../session-store/store.js";
import type { ResponsibilitySnapshot } from "../contracts.js";
import { MAX_CAPTURE_BYTES, type ExternalCoverage } from "./contracts.js";
import { renderCapturePresentation, sha256 } from "./presentation.js";
import { persistedLastEntryMatches } from "../../session-sources/read-only-session.js";
import { anchorFor, V2_ARTIFACT_ENTRY } from "./v2.js";

export type V2CaptureObservation = Readonly<{
  sessionId: string;
  assistantEntryId: string;
  toolCallId: string;
  producer: ResponsibilitySnapshot;
  body: string;
  externalCoverage: ExternalCoverage;
  maxInlineBytes: number;
}>;

export type V2CaptureBinding = Readonly<{
  store: SessionStoreRuntime;
  fence: StoreFence;
  manifest: StoreManifest;
}>;
export type V2CaptureBindingPort = (ctx: any, observation: V2CaptureObservation) => Promise<V2CaptureBinding>;

export class V2CaptureError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "V2CaptureError";
  }
}

export class V2CapturePublisher {
  constructor(
    private readonly pi: { appendEntry(type: string, data: unknown): void },
    private readonly bind: V2CaptureBindingPort,
  ) {}

  async publish(
    observation: V2CaptureObservation,
    ctx: any,
    current: () => boolean,
  ): Promise<{ content: [{ type: "text"; text: string }] }> {
    if (!current()) throw new V2CaptureError("session_changed", "Native capture session changed before publication.");
    const body = Buffer.from(observation.body, "utf8");
    if (
      body.length <= observation.maxInlineBytes ||
      body.length > MAX_CAPTURE_BYTES ||
      !renderCapturePresentation(
        observation.body,
        `artifact:${randomUUID()}`,
        observation.maxInlineBytes,
        observation.externalCoverage,
      )
    )
      throw new V2CaptureError("presentation_unavailable", "Qualified native output cannot be bounded truthfully.");
    const bound = await this.bind(ctx, observation);
    const { store, fence, manifest } = bound;
    if (
      store.status().state !== "ready" ||
      fence.sessionId !== observation.sessionId ||
      manifest.originSessionId !== observation.sessionId ||
      fence.storeId !== manifest.storeId ||
      fence.branchAnchor !== (ctx?.sessionManager?.getLeafId?.() ?? "root")
    )
      throw new V2CaptureError("store_unavailable", "V2 capture store is not bound to this native branch.");
    const onBranch = () =>
      current() &&
      ctx?.sessionManager?.getSessionId?.() === observation.sessionId &&
      (ctx?.sessionManager?.getLeafId?.() ?? "root") === fence.branchAnchor;
    await store.assertWritable(fence);
    if (!onBranch())
      throw new V2CaptureError("session_changed", "Native capture session changed before artifact publication.");
    const occurrenceId = `occurrence:${randomUUID()}`;
    const published = await store.publishArtifact(
      {
        content: body,
        descriptor: {
          version: 1,
          occurrenceId,
          domain: "execution",
          mediaType: "text/plain",
          encoding: "utf-8",
          sourceObservation: { observedBytes: body.length, observedSha256: storeDigest(body) },
          coverage: {
            capture: observation.externalCoverage === "limited" ? "limited" : "unknown",
            boundary: "tool-result-hook",
          },
          origin: {
            producer: "native:bash",
            nativeEntryId: observation.assistantEntryId,
            requestedByExecutionId:
              observation.producer.executionId &&
              /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(observation.producer.executionId)
                ? observation.producer.executionId
                : `call:${sha256(observation.toolCallId)}`,
          },
          retention: { class: "session" },
        },
      },
      fence,
    );
    const preview = renderCapturePresentation(
      observation.body,
      published.descriptor.id,
      observation.maxInlineBytes,
      observation.externalCoverage,
    );
    if (!preview || !onBranch())
      throw new V2CaptureError("session_changed", "Native capture changed before event publication.");
    const payload: StoreJson = {
      occurrenceId,
      artifactId: published.descriptor.id,
      assistantEntryId: observation.assistantEntryId,
      toolCallId: observation.toolCallId,
      toolName: "bash",
      bodySha256: published.descriptor.sha256,
      emittedSha256: sha256(preview.text),
      externalCoverage: observation.externalCoverage,
      producer: structuredClone(observation.producer) as StoreJson,
    };
    await store.appendEvent(
      {
        version: 1,
        id: `event:${randomUUID()}`,
        domain: "execution",
        kind: "native-capture",
        operationId: "native.bash",
        recordedSessionId: observation.sessionId,
        branchAnchor: fence.branchAnchor,
        payload,
        artifactRefs: [published.descriptor.id],
        payloadHash: storeDigest(canonicalStoreJson(payload)),
      },
      fence,
    );
    if (!onBranch()) throw new V2CaptureError("session_changed", "Native capture changed before anchor publication.");
    const anchor = anchorFor(published.descriptor, manifest, {
      assistantEntryId: observation.assistantEntryId,
      toolCallId: observation.toolCallId,
      toolName: "bash",
      emissionSha256: sha256(preview.text),
      externalCoverage: observation.externalCoverage,
      scope: "tool-result-hook",
    });
    this.pi.appendEntry(V2_ARTIFACT_ENTRY, anchor);
    const manager = ctx?.sessionManager;
    const path = manager?.getSessionFile?.();
    const leaf = manager?.getLeafId?.();
    if (typeof path !== "string" || !path || typeof leaf !== "string")
      throw new V2CaptureError("anchor_unavailable", "Persistent native anchor path is unavailable.");
    const live = manager.getBranch?.() ?? [];
    const matches = live.filter(
      (entry: any) =>
        entry.type === "custom" &&
        entry.customType === V2_ARTIFACT_ENTRY &&
        entry.data?.id === anchor.id &&
        canonicalStoreJson(entry.data) === canonicalStoreJson(anchor),
    );
    if (
      manager.getSessionId?.() !== observation.sessionId ||
      matches.length !== 1 ||
      matches[0].id !== leaf ||
      matches[0].parentId !== fence.branchAnchor ||
      !(await persistedLastEntryMatches(path, matches[0])) ||
      !current()
    )
      throw new V2CaptureError("anchor_unacknowledged", "Native artifact anchor was not acknowledged on ancestry.");
    return { content: [{ type: "text", text: preview.text }] };
  }
}
