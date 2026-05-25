export type RiskReview = {
  invoiceId: string;
  reason: string;
};

export function needsRiskReview(invoiceTotalCents: number) {
  return invoiceTotalCents >= 50000;
}
