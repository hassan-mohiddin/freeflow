import { isStoreIdentifier } from "../session-store/contracts.js";
import type { CallOutcome, Coverage, Json, OperationV2, PresentationPolicy, UiPresentation } from "../contracts.js";
import { freezeJson } from "../schema.js";

export type PresentedV2 = Readonly<{
  content: readonly [{ type: "text"; text: string }];
  details: Readonly<{
    status: "called";
    outcome: Json;
    freeflowV2: Readonly<{
      version: 1;
      occurrenceId?: string;
      modelCoverage: Json;
      artifactRefs: readonly string[];
      artifactBytes: number;
      readBytes?: number;
      persistence: Json;
      ui: UiPresentation;
      presentationFailure?: string;
    }>;
  }>;
}>;

function validCoverage(value: unknown): value is Coverage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    !Object.keys(item).every((key) => ["kind", "boundary", "continuation"].includes(key)) ||
    !["complete-at-boundary", "limited", "unknown"].includes(item.kind as string) ||
    typeof item.boundary !== "string" ||
    !item.boundary ||
    item.boundary.length > 1000
  )
    return false;
  if (item.continuation !== undefined) {
    try {
      freezeJson(item.continuation);
    } catch {
      return false;
    }
  }
  return true;
}

function compactCoverage(value: Coverage): Json {
  if (value.continuation === undefined) return { kind: value.kind, boundary: value.boundary };
  try {
    const text = JSON.stringify(value.continuation);
    if (Buffer.byteLength(text, "utf8") <= 512)
      return { kind: value.kind, boundary: value.boundary, continuation: freezeJson(value.continuation) };
  } catch {
    /* A malformed presenter continuation never enters Pi details. */
  }
  return { kind: value.kind, boundary: value.boundary, continuationUnavailable: true };
}

function fallback(outcome: CallOutcome, limit: number): string {
  const condition =
    outcome.persistence?.state === "sidecar-acknowledged" && !outcome.persistence.code
      ? "presentation unavailable; sidecar occurrence acknowledged"
      : `source/artifact unavailable${outcome.persistence?.code ? ` (${outcome.persistence.code})` : ""}`;
  const text = `${outcome.operation.id}@${outcome.operation.revision}: ${outcome.status}; effect ${outcome.effectState}; ${condition}.`;
  return Buffer.from(text, "utf8").subarray(0, limit).toString("utf8");
}

export function v2ModelHeader(outcome: CallOutcome): string {
  return `${outcome.operation.id}@${outcome.operation.revision}: ${outcome.status}; effect ${outcome.effectState}${outcome.occurrenceId ? `; occurrence ${outcome.occurrenceId}` : ""}.\n`;
}

export async function presentV2(
  operation: OperationV2,
  input: Json,
  outcome: CallOutcome,
  policy: PresentationPolicy,
): Promise<PresentedV2> {
  if (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 256)
    throw new Error("v2_presentation_policy: Model-view budget is invalid.");
  const header = v2ModelHeader(outcome);
  const summary = `${outcome.operation.id}@${outcome.operation.revision} · ${outcome.status} · effect ${outcome.effectState}`;
  let text = fallback(outcome, policy.maxBytes);
  let coverage: Coverage = { kind: "unknown", boundary: "presentation-unavailable" };
  let artifactRefs: string[] = [];
  let failure: string | undefined;
  const accepted =
    outcome.occurrenceId && outcome.persistence?.state === "sidecar-acknowledged" && !outcome.persistence.code;
  if (accepted) {
    try {
      const view = await operation.presenter.model(input, outcome as any, {
        maxBytes: policy.maxBytes - Buffer.byteLength(header, "utf8"),
      });
      if (
        typeof view?.text !== "string" ||
        !validCoverage(view.coverage) ||
        !Array.isArray(view.artifactRefs) ||
        view.artifactRefs.length > 16 ||
        !view.artifactRefs.every(isStoreIdentifier) ||
        Buffer.byteLength(header + view.text, "utf8") > policy.maxBytes
      )
        throw new Error("Invalid or oversized model presentation.");
      text = header + view.text;
      coverage = view.coverage;
      artifactRefs = [...view.artifactRefs];
    } catch {
      failure = "model_presentation_unavailable";
    }
  } else failure = "source_or_artifact_unavailable";

  let ui: UiPresentation = { summary };
  if (operation.presenter.ui) {
    try {
      const proposed = await operation.presenter.ui(input, outcome as any);
      if (
        typeof proposed?.summary === "string" &&
        proposed.summary.length <= 256 &&
        (proposed.detail === undefined ||
          (typeof proposed.detail === "string" && Buffer.byteLength(proposed.detail, "utf8") <= 4096))
      )
        ui = proposed;
    } catch {
      /* Display failure cannot change the accepted operation outcome. */
    }
  }
  const compactOutcome: Json = {
    operation: { ...outcome.operation },
    status: outcome.status,
    effectState: outcome.effectState,
    bodyStarted: outcome.bodyStarted,
    ...(outcome.effect ? { effect: outcome.effect } : {}),
    ...(outcome.error ? { error: { code: outcome.error.code.slice(0, 256) } } : {}),
  };
  return {
    content: [{ type: "text", text }],
    details: {
      status: "called",
      outcome: compactOutcome,
      freeflowV2: {
        version: 1,
        ...(outcome.occurrenceId ? { occurrenceId: outcome.occurrenceId } : {}),
        modelCoverage: compactCoverage(coverage),
        artifactRefs,
        artifactBytes: outcome.artifactBytes ?? 0,
        ...(outcome.operation.id === "result.read" &&
        outcome.operation.revision === "2" &&
        typeof (outcome.value as any)?.range?.startBytes === "number" &&
        typeof (outcome.value as any)?.range?.endBytes === "number"
          ? { readBytes: (outcome.value as any).range.endBytes - (outcome.value as any).range.startBytes }
          : {}),
        persistence: outcome.persistence ? { ...outcome.persistence } : { state: "unavailable" },
        ui,
        ...(failure ? { presentationFailure: failure } : {}),
      },
    },
  };
}
