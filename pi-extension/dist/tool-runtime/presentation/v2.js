import { isStoreIdentifier } from "../../session-store/contracts.js";
import { freezeJson } from "../schema.js";
function validCoverage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value;
  if (
    !Object.keys(item).every((key) => ["kind", "boundary", "continuation"].includes(key)) ||
    !["complete-at-boundary", "limited", "unknown"].includes(item.kind) ||
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
function compactCoverage(value) {
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
function fallback(outcome, limit) {
  const condition =
    outcome.persistence?.state === "sidecar-acknowledged" && !outcome.persistence.code
      ? "presentation unavailable; sidecar occurrence acknowledged"
      : `source/artifact unavailable${outcome.persistence?.code ? ` (${outcome.persistence.code})` : ""}`;
  const text = `${outcome.operation.id}@${outcome.operation.revision}: ${outcome.status}; effect ${outcome.effectState}; ${condition}.`;
  return Buffer.from(text, "utf8").subarray(0, limit).toString("utf8");
}
export function v2ModelHeader(outcome) {
  return `${outcome.operation.id}@${outcome.operation.revision}: ${outcome.status}; effect ${outcome.effectState}${outcome.occurrenceId ? `; occurrence ${outcome.occurrenceId}` : ""}.\n`;
}
export async function presentV2(operation, input, outcome, policy) {
  if (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 256)
    throw new Error("v2_presentation_policy: Model-view budget is invalid.");
  const header = v2ModelHeader(outcome);
  const summary = `${outcome.operation.id}@${outcome.operation.revision} · ${outcome.status} · effect ${outcome.effectState}`;
  let text = fallback(outcome, policy.maxBytes);
  let coverage = { kind: "unknown", boundary: "presentation-unavailable" };
  let artifactRefs = [];
  let failure;
  const accepted =
    outcome.occurrenceId && outcome.persistence?.state === "sidecar-acknowledged" && !outcome.persistence.code;
  if (accepted) {
    try {
      const view = await operation.presenter.model(input, outcome, {
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
  let ui = { summary };
  if (operation.presenter.ui) {
    try {
      const proposed = await operation.presenter.ui(input, outcome);
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
  const compactOutcome = {
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
        typeof outcome.value?.range?.startBytes === "number" &&
        typeof outcome.value?.range?.endBytes === "number"
          ? { readBytes: outcome.value.range.endBytes - outcome.value.range.startBytes }
          : {}),
        persistence: outcome.persistence ? { ...outcome.persistence } : { state: "unavailable" },
        ui,
        ...(failure ? { presentationFailure: failure } : {}),
      },
    },
  };
}
