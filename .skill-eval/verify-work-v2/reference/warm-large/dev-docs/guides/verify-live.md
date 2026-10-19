# Verify Live

> **Covers:** `scripts/verify-live.sh`, `bin/serve.js`, `src/server.js`, `src/config.js`
> **Verified at:** `decfdc4` (2026-10-19)

Every live check goes through `scripts/verify-live.sh`, which runs one isolated service per run (`RUN`, default `run-1`).

## Start

`scripts/verify-live.sh start` starts `node bin/serve.js` with `BOOKMARKS_PORT=0`, `BOOKMARKS_DATA_DIR` in `.tmp/verify-live/runs/<run>/data` and `BOOKMARKS_TOKEN=verify-live`. It reads the address from the `listening` log line and waits until `GET /healthz` answers `200`, then prints `ready at <url>`. Requests sent before that answer `503`.

## Drive

`scripts/verify-live.sh call <name> <METHOD> <path> [json]` sends one request with the token and prints the body, then the status. Each call is saved under `verify-evidence/<run>/<name>.txt`.

## Stop And Restart

`scripts/verify-live.sh stop` sends `SIGTERM` and waits for the service to exit, which releases the data folder. `start` again on the same run serves the same data folder, for checks that need a restart.

## Clean Up

`scripts/verify-live.sh cleanup` stops the service and removes the run folder; the evidence stays.
