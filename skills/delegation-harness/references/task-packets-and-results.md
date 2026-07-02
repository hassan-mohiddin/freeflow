# Task Packets And Results

Task packets are child assignments. Results and reports are context compression points.

Use a compact pipe-delimited row protocol, aligned with Output Router compact tool output. This is not CSV. Each line is one record: `TAG|field|field`. Escape literal `|` as `¦`; collapse newlines inside fields to spaces. Keep fields short and use evidence paths/output IDs for raw detail.

## Task Packet

A child should receive a bounded packet:

```text
identity: task, agent, parent, role, profile, cwd/worktree
objective
in scope / out of scope
source pointers: spec, plan, parent report, diff, evidence paths
authority boundaries
tool policy summary
allowed commands
write scope
selected evidence
stop conditions
expected return protocol
trace/result paths
```

The task packet is the child’s world. If it is not in the packet or recoverable through allowed tools, the child should not assume it.

## Result Block

Leaf agents return compact parseable text:

```text
FFRESULT
STATUS|completed|completed_with_risks|blocked|failed|cancelled
SUMMARY|...
EVIDENCE|path-or-outputId|line-or-range|reason
FILES_READ|...
FILES_CHANGED|...
CHECK|command|status|outputId=...
FINDING|severity|path|line|claim
UNCERTAINTY|...
RECOMMENDATION|...
END_FFRESULT
```

The harness stores raw text and parsed JSON. Parent agents usually consume the parsed compact result.

## Blockers And Capability Gaps

When a child cannot continue safely, it should return `STATUS|blocked` with a blocker type:

```text
decision
source_truth_conflict
scope_gap
capability_gap
missing_context
repeated_failure
policy_denied
```

Capability gaps do not grant tools to the same running child. The parent routes the need to itself, another pane, the user, or defers it.

## Parent Reports

Parent reports are handoffs:

- `PLANNING_REPORT`: planning output to orchestrator.
- `EXECUTION_KICKOFF`: orchestrator authorization packet to execution-parent.
- `EXECUTION_REPORT`: execution-parent output to orchestrator.

Reports should name only what changes the next route. Raw details stay recoverable through event logs, transcripts, result paths, and output IDs.

## Parsing Discipline

Missing required result at terminal state is failure. Malformed required output is failure or attention according to state. Unknown status is failure. Evidence fields are required when the role claims findings, verification, or completion.
