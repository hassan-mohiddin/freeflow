export function isPiFlowHost(hostInfo) {
  if (!hostInfo || typeof hostInfo !== "object") return false;
  const host = hostInfo;
  return host.distribution?.id === "piflow" && host.capabilities?.sessionModelStateControl === 1;
}
