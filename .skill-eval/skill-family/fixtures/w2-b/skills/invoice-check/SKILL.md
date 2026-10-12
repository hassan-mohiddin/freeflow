---
name: invoice-check
description: Check an invoice draft's totals, tax and currency before it is sent.
---

# Invoice Check

Start from the draft's line totals and tax lines.

If the invoice converts currency, read `references/rounding.md` before you compare totals.

Write the result to `check.md`: each total, the tax applied, and any mismatch.
