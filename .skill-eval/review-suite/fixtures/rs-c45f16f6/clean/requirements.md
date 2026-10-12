# Requirements

The change makes Freeflow advise the longer prompt-cache tier when the Coordinator's model offers one and the host uses the short tier. Freeflow advises; the host keeps the choice of retention.

1. The routing preset check warns when all of these hold: the Coordinator's model declares a longer prompt-cache tier than its short tier, the host's cache retention is short, and a cache write costs money on that model.
2. The host's retention is read from the environment variable `PI_CACHE_RETENTION`. The value `long` selects the long tier. Any other value, or no value, selects the short tier. This is Pi's only retention control.
3. No retention advice is given when the host's retention is long, or when no retention is passed.
4. The advice is announced once, not on each refresh. It names `PI_CACHE_RETENTION=long` as the setting to choose, gives the minutes of both tiers, and says that Freeflow already keeps the Coordinator warm while a worker runs.
5. Freeflow never sets the retention itself. It only advises.
6. A Coordinator whose model declares no longer tier, or whose tiers are not longer than its short tier, gets no retention advice.
7. The ChatGPT Codex backend is never warmed by the keep-alive and never given a cache breakpoint. The code comments and the tests record why.
