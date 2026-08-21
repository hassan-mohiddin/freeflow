export const failedPaymentGracePeriodDays = 7;

export function shouldKeepPaidAccess(daysSinceFailedPayment: number) {
  return daysSinceFailedPayment <= failedPaymentGracePeriodDays;
}

export const billingAuditEvents: Array<{ eventId: string; userId: string }> = [];

export function downgradeUserImmediately(userId: string) {
  return { userId, plan: "free" };
}
