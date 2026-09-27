import { createHash, randomUUID } from "node:crypto";
import { EFFICIENCY_OBSERVATION_ENTRY, EfficiencyLedger } from "./ledger.js";
import { efficiencyReport } from "./report.js";
const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "proxy-authorization"]);
function jsonText(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
function hashText(value) {
  return value === undefined ? undefined : createHash("sha256").update(value).digest("hex");
}
function bytes(value) {
  return value === undefined ? undefined : Buffer.byteLength(value, "utf8");
}
function nonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function usage(value, source) {
  if (!value || typeof value !== "object") return undefined;
  const cost = value.cost && typeof value.cost === "object" ? value.cost : undefined;
  const normalizedCost = cost
    ? {
        input: nonnegative(cost.input),
        output: nonnegative(cost.output),
        cacheRead: nonnegative(cost.cacheRead),
        cacheWrite: nonnegative(cost.cacheWrite),
        total: nonnegative(cost.total),
      }
    : undefined;
  const hasCost = normalizedCost && Object.values(normalizedCost).some((entry) => typeof entry === "number");
  const normalized = {
    input: nonnegative(value.input),
    output: nonnegative(value.output),
    reasoning: nonnegative(value.reasoning),
    cacheRead: nonnegative(value.cacheRead),
    cacheWrite: nonnegative(value.cacheWrite),
    cacheWrite1h: nonnegative(value.cacheWrite1h),
    totalTokens: nonnegative(value.totalTokens),
    ...(hasCost ? { cost: normalizedCost } : {}),
    source,
  };
  return Object.values(normalized).some((entry) => typeof entry === "number") || hasCost ? normalized : undefined;
}
function sessionId(ctx) {
  const value = ctx?.sessionManager?.getSessionId?.();
  return typeof value === "string" && value ? value : undefined;
}
function leafId(ctx) {
  const value = ctx?.sessionManager?.getLeafId?.();
  return typeof value === "string" && value ? value : undefined;
}
function branch(ctx) {
  const value = ctx?.sessionManager?.getBranch?.();
  return Array.isArray(value) ? value : [];
}
function coverageFor(...values) {
  return values.every((value) => value !== undefined) ? "complete-at-boundary" : "partial";
}
function serializedBytes(value) {
  return bytes(jsonText(value));
}
function toolCall(message, toolCallId) {
  const matches = (Array.isArray(message?.content) ? message.content : []).filter(
    (block) => block?.type === "toolCall" && block.id === toolCallId,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
function toolFacts(result, assistant, entries) {
  const call = toolCall(assistant, result?.toolCallId);
  const args = call?.arguments;
  const details = result?.details;
  const run = details?.freeflowRun;
  const outcome = details?.outcome;
  const captured = entries
    .filter(
      (entry) =>
        entry?.type === "custom" &&
        entry.customType === "freeflow-tool-capture-v1" &&
        entry.data?.toolCallId === result?.toolCallId,
    )
    .at(-1)?.data;
  const anchors = entries.filter(
    (entry) =>
      entry?.type === "custom" &&
      entry.customType === "freeflow-tool-artifact-v2" &&
      entry.data?.native?.toolCallId === result?.toolCallId,
  );
  const capturedV2 = anchors.length === 1 ? anchors[0].data : undefined;
  const recovered = details?.capturedResult?.range ?? details?.capturedArtifact?.range;
  const modelText =
    Array.isArray(result?.content) &&
    result.content.every((item) => item?.type === "text" && typeof item.text === "string")
      ? result.content.map((item) => item.text).join("\n")
      : undefined;
  const emittedBytes = run?.emitted === undefined ? undefined : serializedBytes(run.emitted);
  const manifest =
    typeof run?.runId === "string"
      ? entries
          .filter(
            (entry) =>
              entry?.type === "custom" &&
              entry.customType === "freeflow-tool-run-v1" &&
              entry.data?.runId === run.runId,
          )
          .at(-1)?.data
      : undefined;
  const childOperations = Array.isArray(manifest?.outcomes)
    ? manifest.outcomes.slice(0, 256).flatMap((child) =>
        typeof child?.operation?.id === "string" &&
        typeof child?.operation?.revision === "string" &&
        typeof child?.status === "string" &&
        typeof child?.effectState === "string"
          ? [
              {
                operation: `${child.operation.id}@${child.operation.revision}`,
                status: child.status,
                effectState: child.effectState,
              },
            ]
          : [],
      )
    : undefined;
  const childArtifacts =
    Array.isArray(manifest?.outcomes) &&
    manifest.outcomes.length > 0 &&
    manifest.outcomes.every((child) => Number.isSafeInteger(child?.artifactBytes) && child.artifactBytes >= 0)
      ? manifest.outcomes.reduce((sum, child) => sum + child.artifactBytes, 0)
      : undefined;
  const artifactBytes = Number.isSafeInteger(capturedV2?.bytes)
    ? capturedV2.bytes
    : Number.isSafeInteger(details?.freeflowV2?.artifactBytes)
      ? details.freeflowV2.artifactBytes
      : childArtifacts;
  const operation =
    typeof outcome?.operation?.id === "string"
      ? `${outcome.operation.id}@${outcome.operation.revision ?? "unknown"}`
      : typeof args?.operationKey?.id === "string"
        ? `${args.operationKey.id}@${args.operationKey.revision ?? "unknown"}`
        : undefined;
  return {
    argumentBytes: serializedBytes(args),
    resultBytes: serializedBytes(result?.content),
    ...(modelText !== undefined ? { modelViewBytes: Buffer.byteLength(modelText, "utf8") } : {}),
    ...(artifactBytes !== undefined ? { artifactBytes } : {}),
    ...(typeof args?.code === "string" ? { programSourceBytes: Buffer.byteLength(args.code, "utf8") } : {}),
    ...(emittedBytes !== undefined ? { emittedBytes } : {}),
    ...(Number.isSafeInteger(captured?.capture?.bytes)
      ? { capturedBytes: captured.capture.bytes }
      : Number.isSafeInteger(capturedV2?.bytes)
        ? { capturedBytes: capturedV2.bytes }
        : {}),
    ...(Number.isSafeInteger(recovered?.startBytes) && Number.isSafeInteger(recovered?.endBytes)
      ? { recoveredBytes: Math.max(0, recovered.endBytes - recovered.startBytes) }
      : Number.isSafeInteger(details?.freeflowV2?.readBytes)
        ? { recoveredBytes: details.freeflowV2.readBytes }
        : {}),
    ...(typeof run?.runId === "string" ? { runId: run.runId } : {}),
    ...(operation ? { operation } : {}),
    ...(typeof run?.programStatus === "string" ? { programStatus: run.programStatus } : {}),
    ...(typeof outcome?.effectState === "string" ? { effectState: outcome.effectState } : {}),
    ...(typeof outcome?.coverage?.boundary === "string"
      ? { coverageBoundary: outcome.coverage.boundary }
      : typeof details?.freeflowV2?.modelCoverage?.boundary === "string"
        ? { coverageBoundary: details.freeflowV2.modelCoverage.boundary }
        : typeof details?.capturedArtifact?.coverage?.boundary === "string"
          ? { coverageBoundary: details.capturedArtifact.coverage.boundary }
          : typeof details?.capturedResult?.scope === "string"
            ? { coverageBoundary: details.capturedResult.scope }
            : {}),
    ...(childOperations?.length ? { childOperations } : {}),
  };
}
function assistantIdentity(message) {
  return {
    provider: typeof message?.provider === "string" ? message.provider : undefined,
    model: typeof message?.model === "string" ? message.model : undefined,
    responseModel: typeof message?.responseModel === "string" ? message.responseModel : undefined,
    api: typeof message?.api === "string" ? message.api : undefined,
    responseId: typeof message?.responseId === "string" ? message.responseId : undefined,
    providerThinkingLevel:
      typeof message?.providerThinkingLevel === "string" ? message.providerThinkingLevel : undefined,
    stopReason: typeof message?.stopReason === "string" ? message.stopReason : undefined,
  };
}
export class EfficiencyObserver {
  pi;
  responsibility;
  enabled;
  ledger = new EfficiencyLedger();
  pending = [];
  staged;
  persistenceFailures = 0;
  constructor(pi, responsibility, enabled) {
    this.pi = pi;
    this.responsibility = responsibility;
    this.enabled = enabled;
  }
  reset(ctx) {
    this.flush();
    this.ledger = new EfficiencyLedger();
    this.pending = [];
    this.staged = undefined;
    this.persistenceFailures = 0;
    if (ctx) this.ledger.recover(branch(ctx));
  }
  scope() {
    try {
      return structuredClone(this.responsibility());
    } catch {
      return { profile: "unknown", control: "unknown" };
    }
  }
  deferred = [];
  drainScheduled = false;
  defer(work) {
    this.deferred.push(work);
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    setImmediate(() => this.flush());
  }
  /** Persist deferred observations first so every later observation keeps its native order. */
  flush() {
    this.drainScheduled = false;
    while (this.deferred.length) this.deferred.shift()();
  }
  publish(observation) {
    this.flush();
    this.publishNow(observation);
  }
  publishNow(observation) {
    if (!this.ledger.append(observation)) return;
    try {
      this.pi.appendEntry?.(EFFICIENCY_OBSERVATION_ENTRY, observation);
    } catch {
      // Observation failure must not change provider, routing, or tool behavior.
      this.persistenceFailures += 1;
    }
  }
  observePrepared(payload, ctx) {
    if (!this.enabled()) return;
    const record = payload && typeof payload === "object" ? payload : {};
    const attemptId = randomUUID();
    const responsibility = this.scope();
    const identity = {
      version: 1,
      id: randomUUID(),
      kind: "prepared-request",
      attemptId,
      sessionId: sessionId(ctx),
      basisEntryId: leafId(ctx),
      responsibility,
      provider: typeof ctx?.model?.provider === "string" ? ctx.model.provider : undefined,
      model: typeof record.model === "string" ? record.model : undefined,
      api: typeof ctx?.model?.api === "string" ? ctx.model.api : undefined,
      requestedEffort: typeof record.reasoning?.effort === "string" ? record.reasoning.effort : undefined,
    };
    this.pending.push({
      id: attemptId,
      before: new Set(
        branch(ctx)
          .map((entry) => entry?.id)
          .filter((id) => typeof id === "string"),
      ),
      responseObserved: false,
      responsibility,
    });
    // Serializing and hashing a full request is diagnostic work; it runs after the provider hook returns.
    this.defer(() => {
      const payloadText = jsonText(payload);
      const inputText = jsonText(record.input);
      const { input: _input, instructions: _instructions, tools: _tools, ...envelope } = record;
      const envelopeText = jsonText(envelope);
      this.publishNow({
        ...identity,
        payloadHash: hashText(payloadText),
        inputPrefixHash: hashText(inputText),
        envelopeHash: hashText(envelopeText),
        payloadBytes: bytes(payloadText),
        inputBytes: bytes(inputText),
        instructionBytes: bytes(jsonText(record.instructions)),
        toolSchemaBytes: bytes(jsonText(record.tools)),
        coverage: coverageFor(payloadText, inputText, envelopeText),
      });
    });
  }
  observeResponse(status, headers, ctx) {
    this.flush();
    if (!this.enabled()) return;
    const candidates = this.pending.filter((attempt) => !attempt.responseObserved);
    const attempt = candidates.length === 1 ? candidates[0] : undefined;
    if (attempt) attempt.responseObserved = true;
    const pairs = Object.entries(headers ?? {});
    const headerNames = pairs
      .map(([name]) => name.toLowerCase())
      .filter((name) => !SENSITIVE_HEADERS.has(name))
      .sort()
      .slice(0, 64);
    const observation = {
      version: 1,
      id: randomUUID(),
      kind: "response-headers",
      ...(attempt ? { attemptId: attempt.id } : {}),
      sessionId: sessionId(ctx),
      basisEntryId: leafId(ctx),
      responsibility: attempt?.responsibility ?? this.scope(),
      status: Number.isInteger(status) ? status : 0,
      headerNames,
      headerBytes: pairs.reduce(
        (total, [name, value]) => total + Buffer.byteLength(name, "utf8") + Buffer.byteLength(String(value), "utf8"),
        0,
      ),
      coverage: attempt ? "complete-at-boundary" : "unknown",
    };
    this.publish(observation);
  }
  messageEnd(message, ctx) {
    this.flush();
    if (!this.enabled() || message?.role !== "assistant") return;
    this.staged = {
      message: structuredClone(message),
      before: new Set(
        branch(ctx)
          .map((entry) => entry?.id)
          .filter((id) => typeof id === "string"),
      ),
      responsibility: this.scope(),
    };
  }
  turnEnd(event, ctx) {
    this.flush();
    if (!this.enabled()) return;
    const message = event?.message ?? this.staged?.message;
    if (message?.role !== "assistant") return;
    const before = this.staged?.before ?? new Set();
    const entries = branch(ctx);
    const messageText = jsonText(message);
    const assistantCandidates = entries.filter(
      (entry) =>
        !before.has(entry?.id) &&
        entry?.type === "message" &&
        entry?.message?.role === "assistant" &&
        jsonText(entry.message) === messageText,
    );
    const assistantEntryId = assistantCandidates.length === 1 ? assistantCandidates[0].id : undefined;
    const attempts = this.pending;
    const attempt = attempts.length === 1 ? attempts[0] : undefined;
    const identity = assistantIdentity(message);
    const observation = {
      version: 1,
      id: randomUUID(),
      kind: "assistant-complete",
      ...(attempt ? { attemptId: attempt.id } : {}),
      ...(assistantEntryId ? { assistantEntryId } : {}),
      sessionId: sessionId(ctx),
      basisEntryId: leafId(ctx),
      responsibility: attempt?.responsibility ?? this.staged?.responsibility ?? this.scope(),
      ...identity,
      usage: usage(message.usage, "host-normalized"),
      coverage: assistantEntryId && attempt ? "complete-at-boundary" : "partial",
    };
    this.publish(observation);
    for (const result of Array.isArray(event?.toolResults) ? event.toolResults : []) {
      const resultText = jsonText(result);
      const candidates = entries.filter(
        (entry) =>
          !before.has(entry?.id) &&
          entry?.type === "message" &&
          entry?.message?.role === "toolResult" &&
          entry.message.toolCallId === result?.toolCallId &&
          jsonText(entry.message) === resultText,
      );
      const toolEntryId = candidates.length === 1 ? candidates[0].id : undefined;
      const toolObservation = {
        version: 1,
        id: randomUUID(),
        kind: "tool-complete",
        ...(toolEntryId ? { toolEntryId } : {}),
        sessionId: sessionId(ctx),
        basisEntryId: leafId(ctx),
        responsibility: attempt?.responsibility ?? this.staged?.responsibility ?? this.scope(),
        toolCallId: String(result?.toolCallId ?? "unknown"),
        toolName: String(result?.toolName ?? "unknown"),
        isError: result?.isError === true,
        ...toolFacts(result, message, entries),
        usage: usage(result?.usage, "tool-reported"),
        coverage: toolEntryId ? "complete-at-boundary" : "partial",
      };
      this.publish(toolObservation);
    }
    // A completed assistant turn closes every still-unmatched prepared attempt. If
    // correlation was ambiguous, later work must not guess which prior attempt won.
    this.pending = [];
    this.staged = undefined;
  }
  observations() {
    this.flush();
    return this.ledger.all();
  }
  report() {
    this.flush();
    return {
      ...efficiencyReport(this.ledger.all()),
      measurement: {
        bytes: "serialized UTF-8 bytes at named local boundaries",
        usage:
          "numeric fields are known sums; per-field availability distinguishes zero from missing, with host-normalized provider and tool-reported records grouped separately",
        cost: "known sums with per-field availability; no price-table estimates",
        providerCacheHits: "not inferred",
        storage:
          "artifactBytes counts acknowledged artifact payload bytes only; journal, manifest, orphan and quota overhead are not measured",
        modelView: "modelViewBytes and serialized resultBytes overlap and must not be added together",
      },
      persistenceFailures: this.persistenceFailures,
    };
  }
  exportData(maximumObservations = 256) {
    this.flush();
    const all = this.ledger.all();
    let count = Math.min(maximumObservations, all.length);
    for (;;) {
      const selected = count === 0 ? [] : all.slice(-count);
      const output = {
        version: 1,
        coverage: selected.length === all.length ? "complete-at-boundary" : "limited",
        omittedObservations: all.length - selected.length,
        report: this.report(),
        observations: selected,
      };
      if (Buffer.byteLength(JSON.stringify(output), "utf8") <= 512 * 1024 || count === 0) return output;
      count = Math.floor(count / 2);
    }
  }
}
