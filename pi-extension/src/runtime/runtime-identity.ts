export function isPiFlowHost(hostInfo: unknown): boolean {
  if (!hostInfo || typeof hostInfo !== "object") return false;
  const host = hostInfo as { distribution?: { id?: unknown } };
  return host.distribution?.id === "piflow";
}
