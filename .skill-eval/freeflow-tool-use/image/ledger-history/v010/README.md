# ledger

A household expense ledger on the command line. Entries live in `ledger.json`
(override the path with `LEDGER_FILE`). Amounts are kept as whole cents.

## Usage

```bash
ledger add 2026-10-02 food 23.10 market     # add an entry
ledger balance                               # everything spent
```

## Development

```bash
npm test
```

No dependencies: Node 22 or later.
