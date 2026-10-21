# duration-parse

Parses human durations such as `90s`, `15m`, `2h` or `1h30m` into milliseconds.

```js
import { parseDuration } from "duration-parse";

parseDuration("1h30m"); // 5400000
```

Units: `h` hours, `m` minutes, `s` seconds, `ms` milliseconds. Units may be combined, largest first. Anything else
throws a `RangeError`.

Run the tests with `npm test`.
