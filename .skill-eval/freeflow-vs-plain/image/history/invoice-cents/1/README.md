# shop-invoices

Turns an order (JSON) into the printed invoice we email to customers.

```bash
node bin/invoice.js examples/order.json
```

An order has `customer` and `items`; each item has `description`, `price` (pounds, as written on the price list)
and `qty`. All arithmetic is done in whole pence (`src/money.js`), so totals never drift.

Run the tests with `npm test`.
