export const FREEFLOW_RUNTIME_ENV = "FREEFLOW_RUNTIME";
export function isPiFlowRuntime(env = process.env) {
  return env[FREEFLOW_RUNTIME_ENV] === "piflow";
}
