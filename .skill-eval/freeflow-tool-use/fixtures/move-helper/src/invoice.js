import { cartTotal } from "./cart.js";
import { formatPrice, slugify } from "./utils.js";

/** A plain-text invoice for an order. */
export function invoice(order) {
  const rows = order.lines.map(
    (line) =>
      `${slugify(line.name).padEnd(16)} ${String(line.qty).padStart(3)}  ${formatPrice(line.cents * line.qty).padStart(10)}`,
  );
  return [
    `Invoice ${order.id}`,
    ...rows,
    `${"TOTAL".padEnd(21)}${formatPrice(cartTotal(order.lines)).padStart(10)}`,
  ].join("\n");
}
