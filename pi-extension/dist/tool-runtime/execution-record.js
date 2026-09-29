import { randomUUID } from "node:crypto";
import { isStoreIdentifier } from "./session-store/contracts.js";
import { canonicalStoreJson, storeDigest } from "./session-store/journal.js";
import { canonicalJson, jsonDigest } from "./schema.js";
import { EFFECT_ENTRY } from "./effects.js";
const MIN_INLINE_COVERAGE_BYTES = 1024;
function sameCallAncestry(snapshot, outcome, current) {
  if (current.sessionId !== snapshot.sessionId) return false;
  if (current.branchAnchor === snapshot.branchAnchor) return true;
  const advanced = current.advancedEntries;
  if (outcome.effect !== "mutation" || !advanced || advanced.length < 1 || advanced.length > 2) return false;
  const start = advanced[0]?.data;
  if (
    advanced[0]?.type !== "custom" ||
    advanced[0]?.customType !== EFFECT_ENTRY ||
    start?.event !== "started" ||
    start.sessionId !== snapshot.sessionId ||
    start.parentCallId !== snapshot.parentCallId ||
    start.operation?.id !== snapshot.key.id ||
    start.operation?.revision !== snapshot.key.revision ||
    (snapshot.inputSha256 && start.inputSha256 !== snapshot.inputSha256)
  )
    return false;
  if (advanced.length === 1) return outcome.effectState === "unknown";
  const settled = advanced[1]?.data;
  return (
    advanced[1]?.type === "custom" &&
    advanced[1]?.customType === EFFECT_ENTRY &&
    settled?.event === "settled" &&
    settled.effectId === start.effectId &&
    settled.sessionId === snapshot.sessionId &&
    settled.status === outcome.status &&
    settled.effectState === outcome.effectState
  );
}
function storageCode(error) {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "store_unavailable";
}
export class ExecutionRecordError extends Error {
  code;
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = "ExecutionRecordError";
  }
}
export class V2ExecutionRecorder {
  bind;
  maxInlineValueBytes;
  constructor(bind, maxInlineValueBytes) {
    this.bind = bind;
    this.maxInlineValueBytes = maxInlineValueBytes;
    if (!Number.isSafeInteger(maxInlineValueBytes) || maxInlineValueBytes < 1)
      throw new ExecutionRecordError("record_limit", "Inline value limit must be a positive safe integer.");
  }
  async begin(key, scope, input, host, catalogGeneration = scope.catalogGeneration) {
    const binding = await this.bind(scope, host);
    const { fence, store } = binding;
    const manager = host?.sessionManager;
    const leaf = manager?.getLeafId?.();
    if (
      !isStoreIdentifier(scope.sessionId) ||
      typeof scope.parentCallId !== "string" ||
      !scope.parentCallId ||
      scope.parentCallId.length > 4096 ||
      !isStoreIdentifier(fence.branchAnchor) ||
      fence.sessionId !== scope.sessionId ||
      (manager?.getSessionId && manager.getSessionId() !== scope.sessionId) ||
      (leaf !== undefined && (leaf ?? "root") !== fence.branchAnchor) ||
      store.status().state !== "ready"
    )
      throw new ExecutionRecordError("v2_store_unavailable", "V2 execution store is not bound to this request.");
    await store.assertWritable(fence);
    if (
      (manager?.getSessionId && manager.getSessionId() !== scope.sessionId) ||
      (manager?.getLeafId && (manager.getLeafId() ?? "root") !== fence.branchAnchor)
    )
      throw new ExecutionRecordError(
        "v2_store_unavailable",
        "Native request ancestry changed before effect admission.",
      );
    const occurrenceId = binding.occurrenceId();
    if (!isStoreIdentifier(occurrenceId))
      throw new ExecutionRecordError("v2_store_unavailable", "V2 occurrence identity is invalid.");
    return Object.freeze({
      occurrenceId,
      key: Object.freeze({ ...key }),
      catalogGeneration,
      sessionId: scope.sessionId,
      branchAnchor: fence.branchAnchor,
      parentCallId: scope.parentCallId,
      responsibility: Object.freeze(structuredClone(scope.responsibility)),
      ...(input !== undefined ? { inputSha256: jsonDigest(input) } : {}),
      binding,
      ...(manager?.getSessionId && manager?.getLeafId
        ? {
            currentIdentity: () => {
              const leaf = manager.getLeafId() ?? "root";
              const advanced = [];
              let cursor = leaf;
              while (cursor !== fence.branchAnchor && cursor !== "root" && advanced.length < 3) {
                const entry = manager.getEntry?.(cursor);
                if (!entry) break;
                advanced.unshift(entry);
                cursor = entry.parentId ?? "root";
              }
              return {
                sessionId: manager.getSessionId(),
                branchAnchor: leaf,
                ...(cursor === fence.branchAnchor ? { advancedEntries: advanced } : {}),
              };
            },
          }
        : {}),
    });
  }
  async publishBody(snapshot, bytes, boundary) {
    const published = await snapshot.binding.store.publishArtifact(
      {
        content: bytes,
        descriptor: {
          version: 1,
          occurrenceId: snapshot.occurrenceId,
          domain: "execution",
          mediaType: "application/json",
          encoding: "utf-8",
          coverage: { capture: "complete-at-boundary", boundary },
          sourceObservation: { observedBytes: bytes.length, observedSha256: storeDigest(bytes) },
          origin: {
            producer: `operation:${snapshot.key.id}`,
            requestedByExecutionId:
              snapshot.responsibility.executionId && isStoreIdentifier(snapshot.responsibility.executionId)
                ? snapshot.responsibility.executionId
                : `call:${storeDigest(snapshot.parentCallId)}`,
            operation: snapshot.key,
          },
          retention: { class: "session" },
        },
      },
      snapshot.binding.fence,
    );
    return published.descriptor.id;
  }
  async finish(snapshot, outcome) {
    const refs = [];
    let artifactBytes = 0;
    let artifactError;
    let inlineValue;
    try {
      const current = snapshot.currentIdentity?.();
      if (current && !sameCallAncestry(snapshot, outcome, current))
        throw new ExecutionRecordError("v2_branch_changed", "Native session or branch changed before publication.");
      if (outcome.value !== undefined) {
        const serialized = canonicalJson(outcome.value);
        const bytes = Buffer.from(serialized, "utf8");
        if (bytes.length > this.maxInlineValueBytes) {
          try {
            refs.push(await this.publishBody(snapshot, bytes, "validated-operation-value"));
            artifactBytes += bytes.length;
          } catch (error) {
            artifactError = storageCode(error);
          }
        } else inlineValue = outcome.value;
      }
      const facts = {
        occurrenceId: snapshot.occurrenceId,
        operation: { ...snapshot.key },
        catalogGeneration: snapshot.catalogGeneration,
        parentCallId: snapshot.parentCallId,
        responsibility: snapshot.responsibility,
        status: outcome.status,
        effectState: outcome.effectState,
        bodyStarted: outcome.bodyStarted,
      };
      if (snapshot.inputSha256) facts.inputSha256 = snapshot.inputSha256;
      if (outcome.effect) facts.effect = outcome.effect;
      if (outcome.coverage) {
        const coverageBytes = Buffer.from(canonicalJson(outcome.coverage), "utf8");
        if (coverageBytes.length <= Math.max(MIN_INLINE_COVERAGE_BYTES, this.maxInlineValueBytes))
          facts.coverage = outcome.coverage;
        else {
          try {
            const coverageId = await this.publishBody(snapshot, coverageBytes, "validated-operation-coverage");
            refs.push(coverageId);
            artifactBytes += coverageBytes.length;
            facts.coverage = {
              kind: outcome.coverage.kind,
              boundary: outcome.coverage.boundary,
              coverageArtifactId: coverageId,
            };
          } catch (error) {
            facts.coverage = {
              kind: outcome.coverage.kind,
              boundary: outcome.coverage.boundary,
              continuationUnavailable: storageCode(error),
            };
            artifactError ??= storageCode(error);
          }
        }
      }
      if (outcome.error)
        facts.error = {
          code: outcome.error.code.slice(0, 256),
          message: outcome.error.message.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1000),
        };
      if (outcome.value !== undefined) {
        if (refs.length) facts.valueArtifactId = refs[0];
        else if (artifactError) facts.valueUnavailable = { code: artifactError };
        else facts.value = inlineValue;
      }
      const afterArtifact = snapshot.currentIdentity?.();
      if (afterArtifact && !sameCallAncestry(snapshot, outcome, afterArtifact))
        throw new ExecutionRecordError(
          "v2_branch_changed",
          "Native session or branch changed before event publication.",
        );
      const payload = facts;
      const event = {
        version: 1,
        id: `event:${randomUUID()}`,
        domain: "execution",
        kind: "operation-outcome",
        operationId: snapshot.key.id,
        recordedSessionId: snapshot.sessionId,
        branchAnchor: snapshot.branchAnchor,
        payload,
        artifactRefs: refs,
        payloadHash: storeDigest(canonicalStoreJson(payload)),
      };
      await snapshot.binding.store.appendEvent(event, snapshot.binding.fence);
      return {
        ...outcome,
        occurrenceId: snapshot.occurrenceId,
        artifactRefs: refs,
        artifactBytes,
        persistence: { state: "sidecar-acknowledged", ...(artifactError ? { code: artifactError } : {}) },
      };
    } catch (error) {
      // The operation and any external effect already happened. Never turn them into "no effect" or replay them.
      const code = storageCode(error);
      return {
        ...outcome,
        occurrenceId: snapshot.occurrenceId,
        artifactRefs: refs,
        artifactBytes,
        persistence: { state: "unavailable", code },
      };
    }
  }
}
