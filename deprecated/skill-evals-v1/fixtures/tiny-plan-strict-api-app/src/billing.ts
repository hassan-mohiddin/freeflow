export const failedPaymentGracePeriodDays = 7;

export function shouldKeepPaidAccess(daysSinceFailedPayment: number) {
  return daysSinceFailedPayment <= failedPaymentGracePeriodDays;
}
