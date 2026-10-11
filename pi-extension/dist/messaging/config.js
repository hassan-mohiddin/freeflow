export const DEFAULT_MESSAGING_ENABLED = false;
export const DEFAULT_INBOUND_POLICY = "project";
const POLICIES = ["project", "accept", "hold", "refuse"];
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function validateMessagingConfig(value) {
  if (!record(value)) return "messaging must be an object";
  const unknown = Object.keys(value).find((key) => key !== "enabled" && key !== "inbound");
  if (unknown) return `messaging has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "messaging.enabled must be a boolean";
  if (value.inbound !== undefined && !POLICIES.includes(value.inbound))
    return `messaging.inbound must be one of ${POLICIES.join(", ")}`;
  return null;
}
export function resolveMessagingConfig(repository, local, freeflowEnabled) {
  const repositoryConfig = record(repository.messaging) ? repository.messaging : {};
  const localConfig = record(local.messaging) ? local.messaging : {};
  const pick = (key) => (Object.hasOwn(localConfig, key) ? localConfig[key] : repositoryConfig[key]);
  const value = pick("enabled");
  const enabled = value === undefined ? DEFAULT_MESSAGING_ENABLED : value === true;
  const inbound = POLICIES.includes(pick("inbound")) ? pick("inbound") : DEFAULT_INBOUND_POLICY;
  return { enabled, effective: freeflowEnabled && enabled, inbound };
}
