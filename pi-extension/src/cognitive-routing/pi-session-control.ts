import type { CognitiveRoutingThinkingLevel } from "./types.js";

export const PI_SESSION_MODEL_STATE_ENTRY = "freeflow-cognitive-routing-model-state";

export function supportsPiSessionModelStateApi(pi: unknown): boolean {
  if (!pi || typeof pi !== "object") return false;
  const candidate = pi as Record<string, unknown>;
  return (
    typeof candidate.appendEntry === "function" &&
    typeof candidate.setModel === "function" &&
    typeof candidate.setThinkingLevel === "function"
  );
}

export type PiSessionModelStatePair = {
  provider: string;
  modelId: string;
  thinkingLevel: CognitiveRoutingThinkingLevel;
};

export type PiSessionModelStateRequest = PiSessionModelStatePair & {
  correlationId: string;
};

type PiModel = {
  provider: string;
  id: string;
};

type PiSessionModelStatePi = {
  setModel(model: PiModel): Promise<boolean>;
  setThinkingLevel(level: CognitiveRoutingThinkingLevel): void;
  appendEntry(customType: string, data?: unknown): void;
};

type PiSessionModelStateContext = {
  readonly model?: PiModel;
  readonly thinkingLevel?: CognitiveRoutingThinkingLevel;
  readonly modelRegistry?: {
    find(provider: string, modelId: string): PiModel | undefined;
  };
};

export type PiSessionModelStateCommit = {
  version: 1;
  phase: "prepared" | "committed" | "aborted";
  status: "prepared" | "applied" | "rolled-back" | "rollback-failed";
  correlationId: string;
  fromPair: PiSessionModelStatePair;
  target: PiSessionModelStatePair;
  failure?:
    | "model-change-failed"
    | "thinking-level-change-failed"
    | "pair-verification-failed"
    | "rollback-failed"
    | "commit-persistence-failed"
    | "interrupted-transition";
  observedPair?: PiSessionModelStatePair;
  origin: {
    source: "pi";
    operation: "session-model-state-control";
  };
};

const THINKING_LEVELS = new Set<CognitiveRoutingThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function isThinkingLevel(value: unknown): value is CognitiveRoutingThinkingLevel {
  return typeof value === "string" && THINKING_LEVELS.has(value as CognitiveRoutingThinkingLevel);
}

function appendModelStateCommit(pi: PiSessionModelStatePi, commit: PiSessionModelStateCommit): boolean {
  try {
    pi.appendEntry(PI_SESSION_MODEL_STATE_ENTRY, commit);
    return true;
  } catch {
    return false;
  }
}

function pairFrom(value: unknown): PiSessionModelStatePair | undefined {
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

function failureFrom(value: unknown): PiSessionModelStateCommit["failure"] | undefined {
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

function originFrom(value: unknown): PiSessionModelStateCommit["origin"] | undefined {
  if (!isRecord(value)) return undefined;
  if (value.source !== "pi" || value.operation !== "session-model-state-control") return undefined;
  return { source: "pi", operation: "session-model-state-control" };
}

export function parsePiSessionModelStateCommit(value: unknown): PiSessionModelStateCommit | undefined {
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

  let observedPair: PiSessionModelStatePair | undefined;
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

type PiSessionModelStateLease = {
  setState(request: PiSessionModelStateRequest): Promise<{ status: "applied" | "rejected" }>;
  release(): Promise<{ status: "released" }>;
};

export type PiSessionModelStateAcquisition =
  { status: "acquired"; lease: PiSessionModelStateLease } | { status: "conflict"; owner: string };

function currentPair(ctx: PiSessionModelStateContext): PiSessionModelStatePair | undefined {
  const model = ctx.model;
  if (!model || typeof model.provider !== "string" || typeof model.id !== "string") return undefined;
  if (!ctx.thinkingLevel) return undefined;
  return {
    provider: model.provider,
    modelId: model.id,
    thinkingLevel: ctx.thinkingLevel,
  };
}

function pairsEqual(left: PiSessionModelStatePair | undefined, right: PiSessionModelStatePair): boolean {
  return (
    left?.provider === right.provider && left.modelId === right.modelId && left.thinkingLevel === right.thinkingLevel
  );
}

async function restorePair(
  pi: PiSessionModelStatePi,
  ctx: PiSessionModelStateContext,
  pair: PiSessionModelStatePair,
): Promise<boolean> {
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

export function createPiSessionControllerHost({
  pi,
  ctx,
}: {
  pi: PiSessionModelStatePi;
  ctx: PiSessionModelStateContext;
}) {
  const control = createPiSessionModelStateControl({ pi, ctx });
  return {
    appendEntryDurable(customType: string, data: unknown): void {
      pi.appendEntry(customType, data);
    },
    acquireModelStateControl: control.acquireModelStateControl,
    recoverPreparedModelState: control.recoverPreparedModelState,
  };
}

export function createPiSessionModelStateControl({
  pi,
  ctx,
}: {
  pi: PiSessionModelStatePi;
  ctx: PiSessionModelStateContext;
}) {
  let owner: string | undefined;

  return {
    async recoverPreparedModelState({
      fromPair,
      target,
      correlationId,
    }: {
      fromPair: PiSessionModelStatePair;
      target: PiSessionModelStatePair;
      correlationId: string;
    }): Promise<{ status: "restored" | "rollback-failed" | "rejected" }> {
      const current = currentPair(ctx);
      if (!current || !pairsEqual(current, fromPair)) {
        if (!(await restorePair(pi, ctx, fromPair))) {
          const rollbackFailed: PiSessionModelStateCommit = {
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

      const aborted: PiSessionModelStateCommit = {
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
    async acquireModelStateControl({ label }: { label: string }): Promise<PiSessionModelStateAcquisition> {
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
            } satisfies PiSessionModelStatePair;
            const prepared: PiSessionModelStateCommit = {
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

            let failure: PiSessionModelStateCommit["failure"];

            try {
              const applied = await pi.setModel(targetModel);
              if (!applied) {
                const aborted: PiSessionModelStateCommit = {
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
                const rollbackFailed: PiSessionModelStateCommit = {
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

              const aborted: PiSessionModelStateCommit = {
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

            const commit: PiSessionModelStateCommit = {
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
                const rollbackFailed: PiSessionModelStateCommit = {
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

              const aborted: PiSessionModelStateCommit = {
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
