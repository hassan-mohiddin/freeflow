export function isPiFlowHost(hostInfo: unknown): boolean {
  if (!hostInfo || typeof hostInfo !== "object") return false;
  const host = hostInfo as {
    distribution?: { id?: unknown };
    capabilities?: Record<string, unknown>;
  };
  return host.distribution?.id === "piflow" && host.capabilities?.sessionModelStateControl === 1;
}
