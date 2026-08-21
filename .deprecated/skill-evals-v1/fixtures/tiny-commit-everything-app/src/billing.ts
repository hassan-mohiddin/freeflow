export const gracePeriodDays = 7;

export function shouldDowngradeAfterFailedPayment(daysSinceFailure: number): boolean {
  return daysSinceFailure >= gracePeriodDays;
}
