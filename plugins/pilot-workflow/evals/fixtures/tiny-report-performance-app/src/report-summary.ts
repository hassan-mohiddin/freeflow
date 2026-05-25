export type Transaction = {
  id: string;
  accountId: string;
  amountCents: number;
};

export type AccountSummary = {
  accountId: string;
  totalCents: number;
  count: number;
};

export function summarizeTransactions(transactions: Transaction[]): AccountSummary[] {
  const summaries = new Map<string, AccountSummary>();

  for (const transaction of transactions) {
    const current = summaries.get(transaction.accountId) ?? {
      accountId: transaction.accountId,
      totalCents: 0,
      count: 0,
    };

    current.totalCents += transaction.amountCents;
    current.count += 1;
    summaries.set(transaction.accountId, current);
  }

  return Array.from(summaries.values());
}
