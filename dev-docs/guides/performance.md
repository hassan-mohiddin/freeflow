# Performance

Freeflow runs inside Pi on every turn: before each model request it assembles context, and after each turn it updates routing, compaction and file tracking. That work delays every request, and on a long session it grows with the session unless it is written not to. This page states the rules that keep Freeflow's work small, the budgets, how to measure, and the current numbers. Read it before changing anything on the request path: Freeflow's event handlers (`before_agent_start`, `context_with_system`, `before_provider_request`, `turn_end`, `agent_settled`, `session_start`) and anything they call.

## Why it matters

Freeflow's work is not visible as a feature, so it regresses quietly. Twice it has grown with session length:

- **September 2026.** On a 28 MB real session Freeflow added about 750 ms at session start and 60 to 120 ms to every request, including while disabled. Every cost came from recomputing state from all history, re-reading session files, writing an entry per request, or serializing diagnostics before dispatch. Commits `c71d545`, `1d0ef13` and `61fbb5d` fixed it, and the rules below were written then.
- **October 2026.** Features added since (compaction, Tool Execution, more routing state) asked Pi for the whole session branch 75 times per prompt with routing on, and compaction re-estimated the whole history on every turn. On a 47 MB session routing's per-prompt work had nearly doubled. A per-leaf branch cache and an incremental compaction measurement fixed it, and the request-path budget test now guards both.

## Rules

| Rule | Requirement | What it prevents |
| --- | --- | --- |
| R-1 Memory first | Hold current state in memory and update it per new entry. The request path never reads session or store files. | Routing re-replayed its whole event log on each call (about 730 ms per session start). |
| R-2 Bounded cold start | Startup work grows with what changed since a checkpoint, not with session age. | Session start growing with every routed turn. |
| R-3 Ask Pi once per change | Pi's `getBranch()` walks the whole session and `getContextUsage()` rebuilds the session projection. Use `cachedBranch()` (`pi-extension/src/host/branch.ts`), which walks once per leaf, and take context size from the turn that just ended where it reports usage. | 75 branch walks per prompt; a projection rebuild on every turn. |
| R-4 Change-only, off-path writes | Write entries only when state changes; await only a write the next request depends on; never serialize diagnostics before dispatch. | An entry per request; 25 ms of accounting before dispatch. |
| R-5 Hash once, identify by entry | Compute a content hash once and keep it with the entry; associate request messages with entries through Pi's session projection. Hash per request only what Freeflow generated or the host edited. | 20 to 45 ms per request re-hashing the whole context. |
| R-6 Incremental estimates | A value derived from the whole history (a token estimate, an index) is extended by the entries appended since the last computation, and recomputed only when an entry type changes the projection (a compaction, a summary, a custom message). | Compaction's full-history estimate and result index rebuilt every turn. |
| R-7 Constant-time integrity | Verify persistence by the head (the last entry and its position), not by re-reading and re-comparing the whole file. | Re-reading and parsing the whole session file after a reset. |

A new feature on the request path states which rules its work follows. Work that must touch every entry runs once (at startup, or when the user asks), not per request or per turn.

## Budgets

- **Per prompt:** Freeflow's handlers together stay at or below about 10 ms on a long session with Freeflow on, plus work for the entries appended since the last request. Routing with projection may take more, because it assembles the Coordinator's view (see Known costs).
- **Per turn:** `turn_end` stays at or below 1 ms without routing.
- **Branch walks:** at most 10 calls to Pi's `getBranch()` per prompt, the same for a short and a long session (enforced by `pi-extension/tests/integration/request-path-budget.test.js`).
- **Context-usage estimates:** Freeflow adds none when the turn reports its usage (enforced by the same test).
- **Session start:** at or below 100 ms plus work for routing events since a checkpoint (not yet met with routing on; see Known costs).

## Measuring

Two tools, for different questions:

- **`npm test` (deterministic).** `request-path-budget.test.js` counts Pi branch walks and context-usage estimates during one prompt, on a short and a long history, with Freeflow on defaults and with routing. It fails when a change makes either grow with session length or exceed its budget. Counts do not depend on machine speed, so the test is reliable in CI.
- **`npm run perf:request` (timing).** Runs an in-process Pi offline against a copy of a session and times each Freeflow handler and each prompt, in four scenarios: no Freeflow, Freeflow disabled, Freeflow defaults, and routing with projection plus Tool Execution. By default it generates a session of 2,000 tool-using turns compacted every 150 turns (a large file, about one model window of live context). `--session <path>` measures a real session (a copy is used; the original is not touched), `--dist <dir>` measures another build for comparison, `--json` prints machine-readable output. Timing varies by machine and run: compare builds on the same machine and session, using the medians, and treat differences under a few milliseconds as noise.

When a change touches the request path:

1. Run `npm run perf:request` before and after, on the generated session and, when routing is involved, on a large real routed session.
2. If a number grows, profile: `node --cpu-prof --cpu-prof-dir=<dir> scripts/perf/request-overhead.mjs --scenario <name>` and open the profile in Chrome DevTools or rank it by function.
3. Add or tighten a count in the budget test for any new pattern that could grow with the session.
4. A prompt that ends in an error makes its scenario measure the error path; the script reports it. A real session with unfinished routing work may block requests in the routing scenario; use another session.

## Current numbers

On the development machine, Pi 1.0.0, at the commit that added this page. Added time is the median prompt with Freeflow minus without.

| Session | Scenario | Freeflow adds per prompt | Freeflow at session start |
| --- | --- | --- | --- |
| Generated (2,000 turns, 8k entries) | disabled | about 5 ms | about 3 ms |
| | defaults | about 11 ms | about 1 ms |
| | routing + projection + Tool Execution | about 16 ms | about 4 ms |
| Real, 24 MB (7.8k entries, 4.8k routing events) | disabled | about 7 ms (13 in September) | 33 ms |
| | defaults | about 8 ms (15) | 26 ms |
| | routing + projection + Tool Execution | about 16 ms (28) | about 190 ms (260) |

## Known costs

- **Routing view assembly.** With projection on, routing renders and fingerprints every message in the live context for the Coordinator's view on each request, which breaks R-5 for that view: about 85 ms per request when the live context holds 8,000 messages, and a few milliseconds at a normal model window. Compaction keeps live context near one window, which bounds it.
- **Routing session start.** Startup re-reads and decodes the session file and replays every routing event to check that the session is fully persisted (R-7 and R-2 not yet met): about 190 ms on a 24 MB routed session and about 500 ms on a 47 MB one.

## Related

- [Prompt cache rules](prompt-cache.md): the other request-path contract; a change that is fast but rewrites cached content still costs the user.
- `pi-extension/src/host/branch.ts`, `pi-extension/tests/integration/request-path-budget.test.js`, `scripts/perf/request-overhead.mjs`.
