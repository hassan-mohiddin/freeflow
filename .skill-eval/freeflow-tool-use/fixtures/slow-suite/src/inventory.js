/** A warehouse: for each SKU, how many are on hand and how many are already reserved for orders. */
export function createStock(levels) {
  const stock = new Map();
  for (const [sku, onHand] of Object.entries(levels)) stock.set(sku, { onHand, reserved: 0 });
  return stock;
}

function item(stock, sku) {
  const entry = stock.get(sku);
  if (!entry) throw new Error(`unknown SKU ${sku}`);
  return entry;
}

/** How many can still be reserved. */
export function available(stock, sku) {
  const entry = item(stock, sku);
  return entry.onHand + entry.reserved;
}

/** Reserves qty for an order; refuses more than is available. */
export function reserve(stock, sku, qty) {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("quantity must be a positive whole number");
  if (qty > available(stock, sku)) throw new Error(`only ${available(stock, sku)} of ${sku} available`);
  item(stock, sku).reserved += qty;
}

/** Ships reserved units: they leave the shelf and the reservation. */
export function ship(stock, sku, qty) {
  const entry = item(stock, sku);
  if (qty > entry.reserved) throw new Error(`only ${entry.reserved} of ${sku} reserved`);
  entry.reserved -= qty;
  entry.onHand -= qty;
}

/** Adds delivered units to what is on hand. */
export function restock(stock, sku, qty) {
  item(stock, sku).onHand += qty;
}
