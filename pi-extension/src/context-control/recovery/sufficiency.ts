export const EVIDENCE_SUFFICIENCY_VERSION = "0.1" as const;

export const EVIDENCE_SUFFICIENCY_STATUSES = [
  "visible-sufficient",
  "retained-sufficient",
  "hidden-needed",
  "unavailable",
] as const;
export const EVIDENCE_PRESENCE_VALUES = ["sufficient", "insufficient", "unknown"] as const;
export const HIDDEN_EVIDENCE_VALUES = ["available", "unavailable", "unknown"] as const;

export type EvidenceSufficiencyStatus = (typeof EVIDENCE_SUFFICIENCY_STATUSES)[number];
export type EvidencePresence = (typeof EVIDENCE_PRESENCE_VALUES)[number];
export type HiddenEvidenceAvailability = (typeof HIDDEN_EVIDENCE_VALUES)[number];
export type EvidenceSufficiencyReason =
  | "visible-evidence"
  | "retained-meaning"
  | "exact-evidence-required"
  | "hidden-evidence-unavailable"
  | "visibility-unknown"
  | "retained-meaning-unknown"
  | "input-invalid";

export interface EvidenceSufficiencyInput {
  exactRequired: boolean;
  visible: EvidencePresence;
  retained: EvidencePresence;
  hidden: HiddenEvidenceAvailability;
}

export interface EvidenceSufficiency {
  readonly status: EvidenceSufficiencyStatus;
  readonly reason: EvidenceSufficiencyReason;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEvidencePresence(value: unknown): value is EvidencePresence {
  return typeof value === "string" && EVIDENCE_PRESENCE_VALUES.includes(value as EvidencePresence);
}

function isHiddenEvidenceAvailability(value: unknown): value is HiddenEvidenceAvailability {
  return typeof value === "string" && HIDDEN_EVIDENCE_VALUES.includes(value as HiddenEvidenceAvailability);
}

function unavailable(reason: EvidenceSufficiencyReason): EvidenceSufficiency {
  return Object.freeze({ status: "unavailable", reason });
}

export function assessEvidenceSufficiency(value: unknown): EvidenceSufficiency {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["exactRequired", "visible", "retained", "hidden"].includes(key))
  ) {
    return unavailable("input-invalid");
  }
  if (
    typeof value.exactRequired !== "boolean" ||
    !isEvidencePresence(value.visible) ||
    !isEvidencePresence(value.retained) ||
    !isHiddenEvidenceAvailability(value.hidden)
  ) {
    return unavailable("input-invalid");
  }

  if (value.visible === "sufficient")
    return Object.freeze({ status: "visible-sufficient", reason: "visible-evidence" });
  if (value.visible === "unknown") return unavailable("visibility-unknown");
  if (value.retained === "unknown") return unavailable("retained-meaning-unknown");
  if (!value.exactRequired && value.retained === "sufficient") {
    return Object.freeze({ status: "retained-sufficient", reason: "retained-meaning" });
  }
  if (value.hidden === "available")
    return Object.freeze({ status: "hidden-needed", reason: "exact-evidence-required" });
  return unavailable("hidden-evidence-unavailable");
}
