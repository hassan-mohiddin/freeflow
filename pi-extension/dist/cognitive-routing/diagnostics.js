export const COGNITIVE_ROUTING_DIAGNOSTIC_ENTRY = "freeflow-cognitive-routing-diagnostic";
export function boundedDiagnosticMessage(value) {
  return value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 240);
}
export function diagnosticNotification(report) {
  const { diagnostic, delivery } = report;
  const identity = diagnostic.ref
    ? ` (${diagnostic.ref})`
    : diagnostic.role
      ? ` (${diagnostic.role}${diagnostic.customType ? `:${diagnostic.customType}` : ""})`
      : "";
  const persistence = delivery.persisted ? "diagnostic persisted" : "diagnostic persistence unavailable";
  const notification = delivery.notificationAvailable
    ? delivery.notificationAttempted
      ? "notification requested"
      : "notification not attempted"
    : "notification unavailable";
  return `Cognitive Routing ${diagnostic.stage} blocked: ${diagnostic.code}${identity} — ${diagnostic.message}; ${persistence}; ${notification}.`;
}
