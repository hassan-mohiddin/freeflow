export const EVIDENCE_SUFFICIENCY_VERSION = "0.1";
export const EVIDENCE_SUFFICIENCY_STATUSES = [
  "visible-sufficient",
  "retained-sufficient",
  "hidden-needed",
  "unavailable",
];
export const EVIDENCE_PRESENCE_VALUES = ["sufficient", "insufficient", "unknown"];
export const HIDDEN_EVIDENCE_VALUES = ["available", "unavailable", "unknown"];
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isEvidencePresence(value) {
  return typeof value === "string" && EVIDENCE_PRESENCE_VALUES.includes(value);
}
function isHiddenEvidenceAvailability(value) {
  return typeof value === "string" && HIDDEN_EVIDENCE_VALUES.includes(value);
}
function unavailable(reason) {
  return Object.freeze({ status: "unavailable", reason });
}
export function assessEvidenceSufficiency(value) {
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
