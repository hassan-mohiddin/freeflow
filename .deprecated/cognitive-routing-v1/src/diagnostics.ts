export const COGNITIVE_ROUTING_DIAGNOSTIC_ENTRY = "freeflow-cognitive-routing-diagnostic";

export type CognitiveRoutingDiagnosticStage =
  "selection_validation" | "context_assembly" | "baseline_persistence" | "attribution" | "transition";

export type CognitiveRoutingDiagnosticModelState = "unchanged" | "changed" | "unknown";

export type CognitiveRoutingDiagnostic = {
  version: 1;
  kind: "projection-failure";
  code: string;
  stage: CognitiveRoutingDiagnosticStage;
  message: string;
  modelState: CognitiveRoutingDiagnosticModelState;
  operationId?: string;
  ref?: string;
  role?: string;
  customType?: string;
  position?: number;
};

export type CognitiveRoutingDiagnosticDelivery = {
  persisted: boolean;
  notificationAvailable: boolean;
  notificationAttempted: boolean;
  persistenceError?: string;
  notificationError?: string;
};

export type CognitiveRoutingDiagnosticReport = {
  diagnostic: CognitiveRoutingDiagnostic;
  delivery: CognitiveRoutingDiagnosticDelivery;
};

export type CognitiveRoutingDiagnosticObserver = (
  diagnostic: CognitiveRoutingDiagnostic,
  ctx: any,
) => CognitiveRoutingDiagnosticDelivery | void;

export function boundedDiagnosticMessage(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 240);
}

export function diagnosticNotification(report: CognitiveRoutingDiagnosticReport): string {
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
