export function failedPaymentOutcome() {
  return {
    planStatus: "paid-during-grace",
    graceDays: 7,
    retryCount: 3,
  };
}
