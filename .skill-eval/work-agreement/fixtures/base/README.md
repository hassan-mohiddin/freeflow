# fetchkit

A small HTTP client with retries, and a CSV line parser used by the import job.

- `src/client.js`: `fetchWithRetry(send, options)` calls `send()` and retries failed or rate-limited requests.
- `src/parser.js`: `parseLine(line)` splits one CSV line into fields.

Run the tests with `npm test`.
