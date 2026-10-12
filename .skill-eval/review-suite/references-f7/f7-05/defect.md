# Known defect (for the judge only)

Location: scripts/freeflow-snapshot.mjs:0

Class: logic

Defect: parseArgs reads an option's value from its inline form (--target=<dir>) when present, and only otherwise from the next argument. The seed reads the next argument first, so an inline value is taken only when no next argument exists.

What the defective code does instead: parseArgs(['--target=/x', '--commit', 'HEAD']) sets the target to '--commit' and then rejects 'HEAD' as an unknown argument. A snapshot can be refused, or written to the wrong target when the next token is a path.
