import { formatPence, sumPence, toPence } from "./money.js";

/** The till receipt: one short line per item and the amount to pay. */
export function receiptLines(order) {
  const totals = order.items.map((item) => toPence(item.price) * item.qty);
  const lines = order.items.map((item, index) => `${item.qty} ${item.description} ${formatPence(totals[index])}`);
  return [...lines, `TO PAY ${formatPence(sumPence(totals))}`];
}
