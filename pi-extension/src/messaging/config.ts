/**
 * Messaging between Pi sessions on this machine (Task 002 D-005): a preview, off unless a config turns it on.
 * `inbound` decides what happens to a message from another session: `accept` (the default, Task 002 D-008) delivers
 * it; `project` delivers sessions in the same Task Memory project and holds the rest for the user; `hold` holds every
 * message; `refuse` refuses them all.
 */
export type InboundPolicy = "project" | "accept" | "hold" | "refuse";
export type MessagingState = Readonly<{ enabled: boolean; effective: boolean; inbound: InboundPolicy }>;

export const DEFAULT_MESSAGING_ENABLED = false;
export const DEFAULT_INBOUND_POLICY: InboundPolicy = "accept";
export const INBOUND_POLICIES = ["accept", "project", "hold", "refuse"] as const satisfies readonly InboundPolicy[];
const POLICIES: readonly string[] = INBOUND_POLICIES;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateMessagingConfig(value: unknown): string | null {
  if (!record(value)) return "messaging must be an object";
  const unknown = Object.keys(value).find((key) => key !== "enabled" && key !== "inbound");
  if (unknown) return `messaging has unsupported key: ${unknown}`;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return "messaging.enabled must be a boolean";
  if (value.inbound !== undefined && !POLICIES.includes(value.inbound as string))
    return `messaging.inbound must be one of ${POLICIES.join(", ")}`;
  return null;
}

export function resolveMessagingConfig(
  repository: Record<string, unknown>,
  local: Record<string, unknown>,
  freeflowEnabled: boolean,
): MessagingState {
  const repositoryConfig = record(repository.messaging) ? repository.messaging : {};
  const localConfig = record(local.messaging) ? local.messaging : {};
  const pick = (key: string) => (Object.hasOwn(localConfig, key) ? localConfig[key] : repositoryConfig[key]);
  const value = pick("enabled");
  const enabled = value === undefined ? DEFAULT_MESSAGING_ENABLED : value === true;
  const inbound = POLICIES.includes(pick("inbound") as string)
    ? (pick("inbound") as InboundPolicy)
    : DEFAULT_INBOUND_POLICY;
  return { enabled, effective: freeflowEnabled && enabled, inbound };
}
