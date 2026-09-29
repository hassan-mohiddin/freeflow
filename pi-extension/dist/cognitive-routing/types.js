import { canonical } from "../host/canonical.js";
export const ROUTING_ENTRY = "freeflow-routing-v2";
export const ROUTING_MESSAGE = "freeflow-routing-v2-state";
export const ROUTING_ATTENTION_MESSAGE = "freeflow-routing-attention";
export const WORKER_PROFILES = ["helper", "executor"];
export const PROFILES = ["coordinator", ...WORKER_PROFILES];
export const DELEGATION_MODES = ["executor", "helper", "both"];
export const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export const isWorkerProfile = (value) => WORKER_PROFILES.includes(value);
export const workersForDelegation = (mode) => (mode === "both" ? WORKER_PROFILES : [mode]);
export class RoutingError extends Error {
  code;
  problems;
  constructor(code, message, problems = []) {
    super(message);
    this.code = code;
    this.problems = problems;
    this.name = "RoutingError";
  }
}
export function fail(code, message) {
  throw new RoutingError(code, message);
}
export function requireCondition(condition, code, message = code) {
  if (!condition) fail(code, message);
}
export function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function samePair(left, right) {
  return !!left && !!right && canonical(left) === canonical(right);
}
export const eventKey = (event) => JSON.stringify([event.operationId, event.data.type, event.stepId]);
export const eventValue = (event) =>
  canonical({ version: event.version, operationId: event.operationId, stepId: event.stepId, data: event.data });
export const emptySelection = () => ({ revision: 0, selected: [], unresolved: [], withdrawals: [] });
export const refFor = (id) => `ctx:${id}`;
export function idFor(ref) {
  return /^ctx:([^\s:#]+)$/.exec(ref)?.[1];
}
export { canonical };
