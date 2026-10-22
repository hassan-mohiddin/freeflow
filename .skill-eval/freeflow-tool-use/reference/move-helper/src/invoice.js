import { cartTotal } from "./cart.js";
import { formatMoney as money } from "./money.js";
import { slugify } from "./utils.js";

/** A plain-text invoice for an order. */
export function invoice(order) {
  const rows = order.lines.map(
    (line) =>
      `${slugify(line.name).padEnd(16)} ${String(line.qty).padStart(3)}  ${money(line.cents * line.qty).padStart(10)}`,
  );
  return [`Invoice ${order.id}`, ...rows, `${"TOTAL".padEnd(21)}${money(cartTotal(order.lines)).padStart(10)}`].join(
    "\n",
  );
}
