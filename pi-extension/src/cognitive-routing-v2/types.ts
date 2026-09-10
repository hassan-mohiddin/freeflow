export const ROUTING_ENTRY = "freeflow-routing-v2";
export const ROUTING_MESSAGE = "freeflow-routing-v2-state";
export const PROFILES = ["coordinator", "executor"] as const;
export const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type Profile = (typeof PROFILES)[number];
export type Effort = (typeof EFFORTS)[number];
export type View = Profile | "solo";
export type Control = "automatic" | "manual" | "inactive";
export type Delivery = "pending" | "blocked" | "configured" | "superseded";
export interface Pair {
  provider: string;
  modelId: string;
  thinking: Effort;
}
export interface Unit {
  id: string;
  objective: string;
  state: "open" | "closed";
  assignmentIds: string[];
  disposition?: string;
  assessment?: string;
}
export interface Assignment {
  id: string;
  unitId: string;
  contract: string;
  basisUserEntryId: string | null;
  state: "outstanding" | "returned" | "superseded";
  delegateHandoffId: string;
  returnHandoffId?: string;
}
export interface Handoff {
  id: string;
  kind: "delegate" | "return";
  assignmentId: string;
  text: string;
  from: Profile;
  to: Profile;
  executionId: string;
  toolCallId: string;
  basisUserEntryId: string | null;
  state: Delivery;
  reportRevision: number;
  outcome?: "completed" | "partial" | "blocked";
  limitations: string[];
  reason?: string;
}
export interface Problem {
  ref: string;
  code: string;
  detail: string;
}
export interface Selection {
  revision: number;
  selected: string[];
  unresolved: Problem[];
  withdrawals: { ref: string; reason: string }[];
}
export interface Reservation {
  id: string;
  selectionRevision: number;
  receiver: Profile;
  target: Pair;
  qualification: string;
  sources: { ref: string; bodyHash: string }[];
  maximumInputTokens: number;
  outputReserve: number;
  estimateMethod: string;
}
export interface Execution {
  id: string;
  profile: View;
  assignmentId?: string;
  basisUserEntryId: string | null;
  pair: Pair;
  assistantEntryId?: string;
  resultEntryIds: string[];
  outcome?: "completed" | "failed" | "aborted";
}
export interface Assessment {
  handoffId: string;
  assignmentId: string;
  view: "active" | "suspended";
  basisUserEntryId: string | null;
  problems: Problem[];
  reservation?: Reservation;
}
export type EventData =
  | { type: "control"; control: Control; profile?: Profile; reason: string }
  | { type: "execution-opened"; execution: Execution }
  | {
      type: "execution-bound";
      executionId: string;
      assistantEntryId: string;
      resultEntryIds: string[];
      outcome: "completed" | "failed" | "aborted";
    }
  | {
      type: "delegate-accepted";
      unit: Unit;
      assignment: Assignment;
      handoff: Handoff;
      replacement?: { assignmentId: string; supersededHandoffId?: string; reason: string };
    }
  | { type: "return-accepted"; handoff: Handoff }
  | {
      type: "handoff-retry-requested";
      handoffId: string;
      attemptId: string;
      executionId: string;
      toolCallId: string;
      reportRevision: number;
      selectionRevision: number;
    }
  | { type: "handoff-prepared"; handoffId: string; reservation: Reservation }
  | { type: "handoff-state"; handoffId: string; state: Delivery; reason?: string; observedPair?: Pair }
  | { type: "selection-changed"; assignmentId: string; selection: Selection }
  | {
      type: "assessment-suspended";
      handoffId: string;
      reason: "user-attention" | "delivery-gap";
      basisUserEntryId: string | null;
      problems: Problem[];
    }
  | { type: "assessment-resumed"; handoffId: string; basisUserEntryId: string | null; reservation: Reservation }
  | {
      type: "unit-closed";
      unitId: string;
      outcome: "accepted" | "cancelled" | "deferred";
      assessment: string;
      supersededAssignmentId?: string;
    }
  | { type: "sources-exposed"; executionId: string; view: View; sources: { ref: string; bodyHash: string }[] }
  | {
      type: "request-observed";
      executionId: string;
      profile: View;
      boundary: "assembled" | "payload-hook";
      manifestHash: string;
      handoffId?: string;
      selectionRevision?: number;
    };
export interface RoutingEvent {
  version: 2;
  eventId: string;
  operationId: string;
  stepId: string;
  recordedSessionId: string;
  data: EventData;
}
export interface NativeEntry {
  id: string;
  parentId: string | null;
  type: string;
  customType?: string;
  data?: unknown;
  message?: any;
  [key: string]: any;
}
export interface State {
  control: Control;
  profile?: Profile;
  unitId?: string;
  assignmentId?: string;
  pendingId?: string;
  units: Map<string, Unit>;
  assignments: Map<string, Assignment>;
  handoffs: Map<string, Handoff>;
  executions: Map<string, Execution>;
  selections: Map<string, Selection>;
  reservations: Map<string, Reservation>;
  attempts: Map<string, { executionId: string; reportRevision: number; selectionRevision: number }>;
  exposure: Map<string, string>;
  authors: Map<string, { profile: View; executionId: string; assignmentId?: string }>;
  assessment?: Assessment;
  events: Map<string, RoutingEvent>;
  eventIds: Map<string, string>;
}
export class RoutingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly problems: Problem[] = [],
  ) {
    super(message);
    this.name = "RoutingError";
  }
}
export function fail(code: string, message: string): never {
  throw new RoutingError(code, message);
}
export function requireCondition(condition: unknown, code: string, message = code): asserts condition {
  if (!condition) fail(code, message);
}
export function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function samePair(left: Pair | undefined, right: Pair | undefined): boolean {
  return !!left && !!right && canonical(left) === canonical(right);
}
export const eventKey = (event: RoutingEvent) => JSON.stringify([event.operationId, event.data.type, event.stepId]);
export const eventValue = (event: RoutingEvent) =>
  canonical({ version: event.version, operationId: event.operationId, stepId: event.stepId, data: event.data });
export const emptySelection = (): Selection => ({ revision: 0, selected: [], unresolved: [], withdrawals: [] });
export const refFor = (id: string) => `ctx:${id}`;
export function idFor(ref: string): string | undefined {
  return /^ctx:[^\s:]+$/.test(ref) ? ref.slice(4) : undefined;
}
