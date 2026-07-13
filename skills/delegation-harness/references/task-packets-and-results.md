# Task Packets And Results

Task packets are child assignments. Results and reports are context compression points.

Use file-backed packets for substantive launch or follow-up instructions. Do not paste long multiline packets into an active Pi TUI.

Use the right representation for the interface:

- Child task prompts are readable Markdown by default.
- Tool outputs, alerts, compact parent-facing envelopes, and legacy fallback result blocks use compact pipe-style rows.
- Canonical state is JSON/JSONL.
- Raw transcripts and screens are recoverable evidence, not normal handoff content.

Pipe rows are not CSV. Each row is one record: `TAG|field|field`. Escape literal `|` as `¦`; collapse newlines inside fields to spaces. Keep fields short and use evidence paths/output IDs for raw detail.

## Task Packet

A child should receive a bounded Markdown packet:

```md
# Delegated task: worker-p1

## Objective
Implement the assigned work package.

## Scope
In:
- named files or work package

Out:
- commits and pushes
- unrelated files

## Tools and policy
Allowed tools:
- read
- edit/write inside scope

## Return
Use `delegate_finish` when active. Otherwise use the legacy `FFRESULT` fallback.
```

The packet should still carry identity, role/profile, cwd/worktree, source pointers, authority boundaries, tool policy summary, allowed commands, write scope, selected evidence, stop conditions, expected return protocol, and trace/result paths. It should do that in readable Markdown, not pipe-heavy rows.

The task packet is the child’s world. If it is not in the packet or recoverable through allowed tools, the child should not assume it.

## Result Block

Leaf agents prefer role-native lifecycle tools when active:

- `delegate_finish` stores a terminal result/report and alerts the direct parent.
- `delegate_attention` records a blocker or parent-attention request.
- `delegate_progress` records store-only progress.

Do not tell a child to use lifecycle tools unless they are actually active in its task packet. If lifecycle tools are unavailable, leaf agents return legacy role-native compact text.

Workers can use:

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

Reviewers return findings grouped by blocking/non-blocking/questions. Artifact reviewers use artifact-review shape. Verifiers return exact state identity, checks run, evidence pointers, exercised boundaries, proved/unproved claims, unexpected mutations, and `Pass | Fail | Inconclusive | Unavailable`. Verifiers do not return review findings or fixes.

The harness stores raw text and parsed/canonical JSON. Parent agents usually consume the parsed compact result, direct lifecycle result, or role-specific report through the tool's model-visible compact envelope.

Normal parent decisions should not require reading `.json` files. `delegate_status`, `delegate_wait`, `delegate_result`, inbox/ack, and lifecycle tools should inline bounded state, alerts, summaries, checks, blockers, recommendations, and evidence pointers as compact rows. Read canonical JSON only for malformed/ambiguous output, harness debugging, exact evidence recovery, or user-requested detail.

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

Terminal, blocker, failure, cancellation, malformed-result, missing-result, timeout, and capability-gap states should emit at most one sparse attention alert to the direct parent, backed by stored state. Routine progress stays store-only unless explicit watch mode is active.

## Parent Reports

Parent reports are handoffs:

- `PLANNING_REPORT`: planning output to orchestrator.
- `EXECUTION_KICKOFF`: orchestrator authorization packet to execution-parent.
- `EXECUTION_REPORT`: execution-parent output to orchestrator.

Parents may submit reports through the dedicated report tool or through `delegate_finish` when parent report support is active. Either way, the harness must store canonical task report JSON and a compact direct-parent alert.

Reports should name only what changes the next route. Tool output should surface the report status and route-shaping summary; raw details stay recoverable through event logs, transcripts, result paths, and output IDs.

## Parsing Discipline

Missing required result at terminal state is failure. Malformed required output is failure or attention according to state. Unknown status is failure. Evidence fields are required when the role claims findings, verification, or completion.

Every state and alert needs a failure contract: who may set it, whether it is terminal, required evidence, parent wake behavior, forbidden side effects, and recovery path.
