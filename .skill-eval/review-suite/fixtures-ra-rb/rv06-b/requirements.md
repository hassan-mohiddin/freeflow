# Requirements

The evaluator runs a Pi subject process and keeps the canonical evidence of what it printed. Pi writes a JSON event stream to stdout. The evaluator bounds two things separately. The retained output is the evidence kept for review and is capped by `outputLimitBytes`. The raw transport is every byte read from stdout and stderr, and it is capped by `transportLimitBytes` as an internal safeguard against unbounded output.

1. Before a stdout line is retained, a Pi JSON event is compacted. A `message_update` event keeps `type` and `assistantMessageEvent`, without `partial`. A `message_start` event keeps `type`, and the message `id` and `role`. `turn_end` and `agent_end` keep only `type`. A `tool_execution_update` event keeps `type`, `toolCallId` and `toolName`. Any other event, and any line that is not JSON, is retained unchanged.
2. A retained line ends with a newline when its input line ended with one. A final line that has no newline is retained without one.
3. The retained output limit applies to the compacted output. A chunk that would take the retained output past `outputLimitBytes` is not retained; the run is terminated and reports `output_limit_exceeded`.
4. `retained_output_bytes` reports the bytes actually kept in stdout and stderr. It never exceeds `outputLimitBytes`.
5. `transport_bytes` counts every raw byte read from stdout and stderr, before compaction. When it exceeds `transportLimitBytes`, the run is terminated and reports `transport_limit_exceeded`.
6. Compaction of a cumulative `message_update` stream does not count against the retained output limit, so a long streamed answer that compacts to a small retained output is not reported as an output overflow.
