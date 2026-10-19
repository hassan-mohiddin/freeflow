# discounts

Applies a discount code to an order total and prints the receipt line.

## Rules

- `SAVE10` takes 10% off and `SAVE15` takes 15% off.
- `BULK20` takes 20% off an order of 100.00 or more; a smaller order is unchanged.
- `FLAT5` takes 5.00 off, never going below 0.00.
- No code leaves the total unchanged. An unknown code is an error.

Totals are in currency units. After a percentage discount, round to the nearest cent, with half a cent rounding up: 10% off 10.05 is 9.045, which is 9.05, and 15% off 1.10 is 0.935, which is 0.94.

## Tests

`npm test`
