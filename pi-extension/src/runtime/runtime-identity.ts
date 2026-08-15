export const FREEFLOW_RUNTIME_ENV = "FREEFLOW_RUNTIME";

export function isPiFlowRuntime(env: Record<string, string | undefined> = process.env): boolean {
  return env[FREEFLOW_RUNTIME_ENV] === "piflow";
}
