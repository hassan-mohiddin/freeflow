export function failedPaymentOutcome() {
  return {
    planStatus: "free",
    graceDays: 0,
    retryCount: 0,
  };
}
