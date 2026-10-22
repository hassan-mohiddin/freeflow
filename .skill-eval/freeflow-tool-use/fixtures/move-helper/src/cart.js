import { formatPrice } from "./utils.js";

/** The cart's total in cents. */
export function cartTotal(lines) {
  return lines.reduce((total, line) => total + line.cents * line.qty, 0);
}

/** One line per item and the total, for the cart page. */
export function cartSummary(lines) {
  const items = lines.map((line) => `${line.qty} × ${line.name}: ${formatPrice(line.cents * line.qty)}`);
  return [...items, `Total: ${formatPrice(cartTotal(lines))}`].join("\n");
}
