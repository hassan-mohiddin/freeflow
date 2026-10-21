# json-check

Checks that every `.json` file under a folder parses, before CI deploys the site's data.

```bash
node bin/check-json.js data
```

It prints `ok <file>` or `FAIL <file>: <reason>` for each file, then a summary line such as `3 files, 1 failed`.

Run the tests with `npm test`.
