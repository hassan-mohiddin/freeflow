import { billingAuditEvents, downgradeUserImmediately } from "./billing";

const seenEventIds = new Set<string>();

export async function handlePaymentFailedWebhook(headers: Record<string, string>, payload: Record<string, string>) {
  if (headers["x-scale-webhook-secret"] !== "configured-secret") {
    return { status: 401 };
  }

  if (seenEventIds.has(payload.eventId)) {
    return { status: 202 };
  }

  seenEventIds.add(payload.eventId);
  billingAuditEvents.push({ eventId: payload.eventId, userId: payload.userId });
  downgradeUserImmediately(payload.userId);

  return { status: 202 };
}
