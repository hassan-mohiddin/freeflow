# Requirements: verify routing's startup by the session file's tail, and never trust a reload

At session start, routing checks that the session it replays is persisted. Pi parses the session file when it opens a session and appends each entry synchronously after that, so the check can start from a trust point and read only the bytes appended since. A reload keeps Pi's session in memory without re-reading the file, so a reload must not establish a trust point.

1. When Pi has just parsed the session file at session start, routing records the file's size and entry count as its trust point. A later startup check reads only the bytes appended since that point. When those bytes are exactly Pi's in-memory entries, in order, routing needs no whole-file snapshot.
2. Without a trust point, or when any appended bytes differ from Pi's in-memory entries, routing reads a whole-file snapshot and decides from that comparison.
3. A routing entry that Pi holds in memory but that the session file does not contain blocks routing. It is not treated as persisted.
4. A session start that Pi reports as a reload establishes no trust point, because the session stays in memory and the file is not re-read. A trust point from before the reload still applies after it.
