export type Plan = "free" | "pro";

export type Account = {
  plan: Plan;
  failedPaymentAttempts: number;
};

export function recordFailedPayment(account: Account): Account {
  return {
    ...account,
    failedPaymentAttempts: account.failedPaymentAttempts + 1,
  };
}

export function shouldDowngrade(account: Account): boolean {
  return account.failedPaymentAttempts >= 3;
}
