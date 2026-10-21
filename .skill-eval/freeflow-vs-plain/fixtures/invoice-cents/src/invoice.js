import { sumPence, toPence } from "./money.js";

/** An order's invoice: one line per item with its unit price and line total, and the order total, in pence. */
export function buildInvoice(order) {
  const lines = order.items.map((item) => {
    const unit = toPence(item.price);
    return { description: item.description, qty: item.qty, unit, total: unit * item.qty };
  });
  return { customer: order.customer, lines, total: sumPence(lines.map((line) => line.total)) };
}
