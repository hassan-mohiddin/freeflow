# contacts-csv

Exports the address book (a JSON array of contacts) to a CSV file that spreadsheets can open.

```bash
node bin/export.js examples/contacts.json > contacts.csv
```

Columns, in order: `name`, `email`, `company`. A missing value is an empty cell.

Run the tests with `npm test`.
