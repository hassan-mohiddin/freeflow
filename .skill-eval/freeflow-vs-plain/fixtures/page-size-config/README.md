# issue-list

Lists the team's issues from `data/issues.json`, one page at a time.

```bash
node bin/issues.js          # first page
node bin/issues.js --page 2 # second page
```

Each page ends with a footer such as `page 1 of 3 (57 issues)`.

Run the tests with `npm test`.
