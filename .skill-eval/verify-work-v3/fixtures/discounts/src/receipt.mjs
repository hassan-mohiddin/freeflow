import { applyDiscount } from "./discount.mjs";

/** One receipt line, such as "Subtotal 10.05, SAVE10, total 9.05". */
export function formatReceipt({ total, code }) {
  const discounted = applyDiscount(total, code);
  return `Subtotal ${total.toFixed(2)}, ${code || "no code"}, total ${discounted.toFixed(2)}`;
}
