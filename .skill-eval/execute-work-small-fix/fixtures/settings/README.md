# feed-settings

Settings for the feed service. `loadSettings(overrides)` in `src/settings.js` starts from `config/defaults.json` and applies the caller's overrides.

| Setting | Default | Meaning |
| --- | --- | --- |
| `pageSize` | 20 | Items per page when the caller asks for none |
| `maxPageSize` | 100 | Largest page a caller may ask for |
| `timeoutMs` | 5000 | Upstream request timeout |
| `theme` | `light` | Feed theme |

A `pageSize` above `maxPageSize` is rejected with a `RangeError`.

Run the tests with `node --test`.
