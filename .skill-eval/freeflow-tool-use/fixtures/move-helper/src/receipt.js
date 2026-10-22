import { cartTotal } from "./cart.js";
import { formatPrice } from "./utils.js";

/** The till receipt: the total, what was paid, and the change. */
export function receipt(lines, paidCents) {
  const total = cartTotal(lines);
  return [
    `Total ${formatPrice(total)}`,
    `Paid ${formatPrice(paidCents)}`,
    `Change ${formatPrice(paidCents - total)}`,
  ].join("\n");
}
