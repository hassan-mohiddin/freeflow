export const PI_SESSION_MODEL_STATE_ENTRY = "freeflow-cognitive-routing-model-state";
export function supportsPiSessionModelStateApi(pi) {
  if (!pi || typeof pi !== "object") return false;
  const candidate = pi;
  return (
    typeof candidate.appendEntry === "function" &&
    typeof candidate.setModel === "function" &&
    typeof candidate.setThinkingLevel === "function"
  );
}
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isThinkingLevel(value) {
  return typeof value === "string" && THINKING_LEVELS.has(value);
}
function appendModelStateCommit(pi, commit) {
  try {
    pi.appendEntry(PI_SESSION_MODEL_STATE_ENTRY, commit);
    return true;
  } catch {
    return false;
  }
}
function pairFrom(value) {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.provider !== "string" ||
    typeof value.modelId !== "string" ||
    !isThinkingLevel(value.thinkingLevel)
  ) {
    return undefined;
  }
  return {
    provider: value.provider,
    modelId: value.modelId,
    thinkingLevel: value.thinkingLevel,
  };
}
function failureFrom(value) {
  if (
    value === "model-change-failed" ||
    value === "thinking-level-change-failed" ||
    value === "pair-verification-failed" ||
    value === "rollback-failed" ||
    value === "commit-persistence-failed" ||
    value === "interrupted-transition"
  ) {
    return value;
  }
  return undefined;
}
function originFrom(value) {
  if (!isRecord(value)) return undefined;
  if (value.source !== "pi" || value.operation !== "session-model-state-control") return undefined;
  return { source: "pi", operation: "session-model-state-control" };
}
export function parsePiSessionModelStateCommit(value) {
  if (!isRecord(value) || value.version !== 1) return undefined;
  if (value.phase !== "prepared" && value.phase !== "committed" && value.phase !== "aborted") return undefined;
  if (
    value.status !== "prepared" &&
    value.status !== "applied" &&
    value.status !== "rolled-back" &&
    value.status !== "rollback-failed"
  ) {
    return undefined;
  }
  if (typeof value.correlationId !== "string") return undefined;
  const fromPair = pairFrom(value.fromPair);
  const target = pairFrom(value.target);
  const origin = originFrom(value.origin);
  if (!fromPair || !target || !origin) return undefined;
  if (value.phase === "prepared" && value.status !== "prepared") return undefined;
  if (value.phase === "committed" && value.status !== "applied") return undefined;
  if (value.phase === "aborted" && (value.status === "prepared" || value.status === "applied")) return undefined;
  const failure = failureFrom(value.failure);
  if ((value.phase === "prepared" || value.phase === "committed") && value.failure !== undefined) return undefined;
  if (value.phase === "aborted" && !failure) return undefined;
  let observedPair;
  if (value.observedPair !== undefined) {
    observedPair = pairFrom(value.observedPair);
    if (!observedPair) return undefined;
  }
  return {
    version: 1,
    phase: value.phase,
    status: value.status,
    correlationId: value.correlationId,
    fromPair,
    target,
    ...(failure ? { failure } : {}),
    ...(observedPair ? { observedPair } : {}),
    origin,
  };
}
function currentPair(ctx) {
  const model = ctx.model;
  if (!model || typeof model.provider !== "string" || typeof model.id !== "string") return undefined;
  if (!ctx.thinkingLevel) return undefined;
  return {
    provider: model.provider,
    modelId: model.id,
    thinkingLevel: ctx.thinkingLevel,
  };
}
function pairsEqual(left, right) {
  return (
    left?.provider === right.provider && left.modelId === right.modelId && left.thinkingLevel === right.thinkingLevel
  );
}
async function restorePair(pi, ctx, pair) {
  const model = ctx.modelRegistry?.find(pair.provider, pair.modelId);
  if (!model) return false;
  try {
    if (!(await pi.setModel(model))) return false;
    pi.setThinkingLevel(pair.thinkingLevel);
    return pairsEqual(currentPair(ctx), pair);
  } catch {
    return false;
  }
}
export function createPiSessionControllerHost({ pi, ctx }) {
  const control = createPiSessionModelStateControl({ pi, ctx });
  return {
    appendEntryDurable(customType, data) {
      pi.appendEntry(customType, data);
    },
    acquireModelStateControl: control.acquireModelStateControl,
    recoverPreparedModelState: control.recoverPreparedModelState,
  };
}
export function createPiSessionModelStateControl({ pi, ctx }) {
  let owner;
  return {
    async recoverPreparedModelState({ fromPair, target, correlationId }) {
      const current = currentPair(ctx);
      if (!current || !pairsEqual(current, fromPair)) {
        if (!(await restorePair(pi, ctx, fromPair))) {
          const rollbackFailed = {
            version: 1,
            phase: "aborted",
            status: "rollback-failed",
            correlationId,
            fromPair,
            target,
            failure: "rollback-failed",
            ...(currentPair(ctx) ? { observedPair: currentPair(ctx) } : {}),
            origin: { source: "pi", operation: "session-model-state-control" },
          };
          try {
            pi.appendEntry(PI_SESSION_MODEL_STATE_ENTRY, rollbackFailed);
          } catch {
            return { status: "rejected" };
          }
          return { status: "rollback-failed" };
        }
      }
      const aborted = {
        version: 1,
        phase: "aborted",
        status: "rolled-back",
        correlationId,
        fromPair,
        target,
        failure: "interrupted-transition",
        origin: { source: "pi", operation: "session-model-state-control" },
      };
      try {
        pi.appendEntry(PI_SESSION_MODEL_STATE_ENTRY, aborted);
      } catch {
        return { status: "rejected" };
      }
      return { status: "restored" };
    },
    async acquireModelStateControl({ label }) {
      if (owner !== undefined) return { status: "conflict", owner };
      owner = label;
      let released = false;
      return {
        status: "acquired",
        lease: {
          async setState(request) {
            if (released) return { status: "rejected" };
            const fromPair = currentPair(ctx);
            const targetModel = ctx.modelRegistry?.find(request.provider, request.modelId);
            if (!fromPair || !targetModel) return { status: "rejected" };
            const target = {
              provider: request.provider,
              modelId: request.modelId,
              thinkingLevel: request.thinkingLevel,
            };
            const prepared = {
              version: 1,
              phase: "prepared",
              status: "prepared",
              correlationId: request.correlationId,
              fromPair,
              target,
              origin: { source: "pi", operation: "session-model-state-control" },
            };
            try {
              pi.appendEntry(PI_SESSION_MODEL_STATE_ENTRY, prepared);
            } catch {
              return { status: "rejected" };
            }
            let failure;
            try {
              const applied = await pi.setModel(targetModel);
              if (!applied) {
                const aborted = {
                  version: 1,
                  phase: "aborted",
                  status: "rolled-back",
                  correlationId: request.correlationId,
                  fromPair,
                  target,
                  failure: "model-change-failed",
                  origin: { source: "pi", operation: "session-model-state-control" },
                };
                appendModelStateCommit(pi, aborted);
                return { status: "rejected" };
              }
              try {
                pi.setThinkingLevel(request.thinkingLevel);
              } catch {
                failure = "thinking-level-change-failed";
              }
              if (!failure && !pairsEqual(currentPair(ctx), target)) {
                failure = "pair-verification-failed";
              }
            } catch {
              failure = "model-change-failed";
            }
            if (failure) {
              const restored = await restorePair(pi, ctx, fromPair);
              if (!restored) {
                const rollbackFailed = {
                  version: 1,
                  phase: "aborted",
                  status: "rollback-failed",
                  correlationId: request.correlationId,
                  fromPair,
                  target,
                  failure: "rollback-failed",
                  ...(currentPair(ctx) ? { observedPair: currentPair(ctx) } : {}),
                  origin: { source: "pi", operation: "session-model-state-control" },
                };
                appendModelStateCommit(pi, rollbackFailed);
                return { status: "rejected" };
              }
              const aborted = {
                version: 1,
                phase: "aborted",
                status: "rolled-back",
                correlationId: request.correlationId,
                fromPair,
                target,
                failure,
                origin: { source: "pi", operation: "session-model-state-control" },
              };
              appendModelStateCommit(pi, aborted);
              return { status: "rejected" };
            }
            const commit = {
              version: 1,
              phase: "committed",
              status: "applied",
              correlationId: request.correlationId,
              fromPair,
              target,
              origin: { source: "pi", operation: "session-model-state-control" },
            };
            try {
              if (!appendModelStateCommit(pi, commit)) throw new Error("commit persistence failed");
              return { status: "applied" };
            } catch {
              const restored = await restorePair(pi, ctx, fromPair);
              if (!restored) {
                const rollbackFailed = {
                  version: 1,
                  phase: "aborted",
                  status: "rollback-failed",
                  correlationId: request.correlationId,
                  fromPair,
                  target,
                  failure: "rollback-failed",
                  ...(currentPair(ctx) ? { observedPair: currentPair(ctx) } : {}),
                  origin: { source: "pi", operation: "session-model-state-control" },
                };
                appendModelStateCommit(pi, rollbackFailed);
                return { status: "rejected" };
              }
              const aborted = {
                version: 1,
                phase: "aborted",
                status: "rolled-back",
                correlationId: request.correlationId,
                fromPair,
                target,
                failure: "commit-persistence-failed",
                origin: { source: "pi", operation: "session-model-state-control" },
              };
              appendModelStateCommit(pi, aborted);
              return { status: "rejected" };
            }
          },
          async release() {
            if (!released) {
              released = true;
              if (owner === label) owner = undefined;
            }
            return { status: "released" };
          },
        },
      };
    },
  };
}
