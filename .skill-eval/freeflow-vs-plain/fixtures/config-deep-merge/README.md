# status-board

A small status page server. Settings come from `config.json` in the working directory (or the file given with
`--config`), laid over the defaults in `src/config.js`; any setting you leave out keeps its default.

```json
{
  "server": { "host": "127.0.0.1", "port": 8080 },
  "log": { "level": "info", "format": "text" },
  "checks": ["https://example.com/health"]
}
```

`node bin/start.js --dry-run` prints the settings it would start with, without starting the server.

Run the tests with `npm test`.
