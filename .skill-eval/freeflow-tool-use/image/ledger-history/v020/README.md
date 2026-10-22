# ledger

A household expense ledger on the command line. Entries live in `ledger.json` and monthly budgets in `budgets.json`
(override the paths with `LEDGER_FILE` and `LEDGER_BUDGETS`). Amounts are kept as whole cents.

## Usage

```bash
ledger add 2026-10-02 food 23.10 market     # add an entry
ledger balance                               # everything spent
ledger report                                # total per month
ledger budget 2026-10                        # what is left of each budget in October
ledger import bank.csv                       # entries from a bank export (date,category,description,amount)
```

`budgets.json` holds a monthly limit per category: `{ "food": "400.00", "travel": "100" }`.

## Development

```bash
npm test
```

No dependencies: Node 22 or later.
