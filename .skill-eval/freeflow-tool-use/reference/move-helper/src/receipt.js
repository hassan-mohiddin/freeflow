import { cartTotal } from "./cart.js";
import { formatMoney as money } from "./money.js";

/** The till receipt: the total, what was paid, and the change. */
export function receipt(lines, paidCents) {
  const total = cartTotal(lines);
  return [`Total ${money(total)}`, `Paid ${money(paidCents)}`, `Change ${money(paidCents - total)}`].join("\n");
}
