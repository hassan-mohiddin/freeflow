# Working Record: HTTP retry

Schema: 4
State: active
Last updated: 2026-09-28T16:40:00.000Z

## Current Context

### Goal

- The HTTP client in src/http/client.ts retries 429 and 5xx with backoff and honors Retry-After on 429.

### What defines this task

- (none)

### Settled

- Retry 429 and 5xx only; at most 4 attempts; Retry-After overrides the computed delay.

## Current Work

### Current Slice

None

### Recovery sources

- src/http/client.ts — retryWithBackoff, where the 429 path is unfinished.

### Next useful action

- Honor Retry-After in retryWithBackoff for 429 responses.

## Future Work

## History

### Decisions

### Checkpoints

### Slices

## Notes
