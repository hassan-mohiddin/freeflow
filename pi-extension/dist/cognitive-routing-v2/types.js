export const ROUTING_ENTRY = "freeflow-routing-v2";
export const ROUTING_MESSAGE = "freeflow-routing-v2-state";
export const PROFILES = ["coordinator", "executor"];
export const EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
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
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
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
  return /^ctx:[^\s:]+$/.test(ref) ? ref.slice(4) : undefined;
}
