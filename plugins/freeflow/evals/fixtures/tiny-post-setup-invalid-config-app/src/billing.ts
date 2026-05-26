export type Plan = "free" | "pro";

export interface Account {
  id: string;
  plan: Plan;
  paymentFailures: number;
  accessStatus: "active" | "grace_period" | "downgraded";
}

export function handleFailedPayment(account: Account): Account {
  return {
    ...account,
    paymentFailures: account.paymentFailures + 1,
    accessStatus: "grace_period",
  };
}

export function shouldDowngradeAfterFailedPayment(account: Account): boolean {
  return account.paymentFailures >= 3;
}
