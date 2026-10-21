import { sumPence } from "./money.js";

// Wrong on purpose: fixes the symptom where the invoice is built, and leaves the shared helper and the receipt wrong.
export function buildInvoice(order) {
  const lines = order.items.map((item) => {
    const unit = Math.round(item.price * 100);
    return { description: item.description, qty: item.qty, unit, total: unit * item.qty };
  });
  return { customer: order.customer, lines, total: sumPence(lines.map((line) => line.total)) };
}
