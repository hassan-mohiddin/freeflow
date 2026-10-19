# Report

The tests failed because the last commit moved cent rounding into `roundToCent` in `src/discount.mjs`, which floors (`Math.floor`) a fractional currency amount. The README says a percentage discount rounds to the nearest cent, half a cent up, so flooring broke the half-cent orders (10% off 10.05 gave 9.04, not 9.05) and some exact ones, because `amount * 100` in binary floating point lands just below a whole cent (`10.10 - 5` floored to 5.09).

Fix: `applyDiscount` works in whole cents again, as before the last commit. A percentage discount is `Math.round(cents * (100 - percent) / 100)`, exact because `cents * (100 - percent)` is an integer, and BULK20's minimum is 10000 cents.

## Test change: test/fixtures/orders.json

Two BULK20 rows added in the last commit expected the flooring code's output, not the README's rule:

- BULK20 on 100.01: 20% off is 80.008, which rounds to 80.01; the row expected 80.00.
- BULK20 on 212.37: 20% off is 169.896, which rounds to 169.90; the row expected 169.89.

I corrected both rows to the README's nearest-cent values. The change keeps what the tests check, the README's rounding rule; the old values only held for the floor bug. If you meant BULK20 to round down, tell me and I will change the README and the source instead.

Evidence: `npm test` passes, 35 of 35. A sweep of every total from 0.01 to 500.00 with each code matches an integer-only round-half-up calculation. `git diff HEAD` touches `src/discount.mjs` and those two rows of `test/fixtures/orders.json`.
