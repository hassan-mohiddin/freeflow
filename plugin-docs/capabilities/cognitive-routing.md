# Cognitive Routing

Cognitive Routing is an experimental Pi/PiFlow capability for placing compute between a **Coordinator** and an **Executor** inside one active agent and one canonical session. It does not create another agent, transfer Workflow ownership, widen authority, or replace verification and review.

## Current status and host boundary

The current implementation is the `cognitive-routing-v2` source path. Its native Pi entrypoint is wired in the source tree, but it is not a released or installed host integration. Source inspection alone does not prove dispatch. Local SDK and bundled-CLI fixtures exercise native dispatch at captured request boundaries; they do not establish installed-user behavior, universal transport support, or model quality.

The redesigned PiFlow adapter is explicitly unavailable in the current source entrypoint. Installing PiFlow or Freeflow does not make Cognitive Routing available there. PiFlow remains a separate host with its own launch, package, session, and update lifecycle; see [PiFlow integration](../integrations/piflow.md).

On a qualified host, routing is effective only when:

1. Freeflow repository activation is valid and enabled;
2. Cognitive Routing is enabled in configuration;
3. both configured profiles resolve to available, authenticated models with exactly supported thinking levels;
4. the effective Coordinator and Executor pairs are distinct; and
5. the host exposes the model registry, native model/thinking controls, session entries, and session ancestry needed by the adapter.

Missing profiles, unavailable or unauthenticated models, unsupported or clamped thinking levels, identical profiles, invalid configuration, missing host APIs, or a deliberately unavailable adapter leave routing unavailable rather than partially active.

## Configuration

Cognitive Routing uses this schema under `.freeflow/config.json` or `.freeflow/local.json`:

```json
{
  "cognitiveRouting": {
    "enabled": true,
    "projection": false,
    "profiles": {
      "coordinator": {
        "provider": "openai",
        "model": "gpt-4o",
        "thinking": "off"
      },
      "executor": {
        "provider": "openai",
        "model": "gpt-4.1-mini",
        "thinking": "off"
      }
    }
  }
}
```

`projection` defaults to `false`. The accepted profile names are `coordinator` and `executor`; each profile requires `provider`, `model`, and a supported `thinking` value: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`. The two effective provider/model/thinking pairs must differ, and each model must support the requested thinking level without clamping.

Repository configuration is the shared baseline. A valid personal layer can override `enabled`, `projection`, or either complete profile; omitted values inherit from the repository layer. Use `/freeflow settings` or `/freeflow settings local` for personal settings and `/freeflow settings repo` for shared settings. Cognitive Routing is not configured through a session override.

Only the v2 `enabled`/`projection`/`profiles` shape is supported. Older experimental routing names or fields such as `standard`, `reasoning`, `contextProjection`, and `sessionStart` are intentionally unsupported. There is no migration: rewrite the configuration manually using the schema above. Invalid layers fail closed; the runtime does not guess or partially apply them.

## Coordinator and Executor

The two profiles are sequential participants, not independent agents or independent reviewers:

- **Coordinator** interprets user direction, preserves the authority envelope, decides the current unit and assignment, selects or requests evidence, assesses the result, closes the unit, and handles all substantive user-facing interaction.
- **Executor** carries out the current assignment, uses the producing method and bounded environment interactions, records actual observations, and returns a report with limitations.

They share the canonical session, accepted intent, Workflow owner, authority, and evidence requirements. They do not share private reasoning. A profile switch is not independent review, and a report is not acceptance of the unit.

## Automatic and manual control

Under automatic control, Coordinator owns new user direction; input reaching an already prepared Executor request requires an interrupted return before task tools. A normal route is:

```text
Workflow establishes authority, owner, and unit
-> Coordinator assigns one decision-complete assignment
-> Executor executes the assignment and returns its actual report
-> Coordinator receives the saved report and eligible evidence
-> Coordinator assesses, continues, or closes the unit
```

`freeflow_delegate` creates or replaces an assignment. `freeflow_return` saves or retries the Executor handoff. Returning ends ordinary Executor work for that assignment; it does not accept or close the unit. Coordinator can continue covered work, ask for a corrected assignment, or close only after the result is supported.

Manual control keeps one selected profile active and runs the ordinary unsplit Workflow. Automatic handoffs and projection are bypassed. Manual control does not grant extra authority or make the held profile a separate agent.

## Routing tools

The v2 tools are available only while the capability and the relevant automatic control state are effective. `freeflow_unit` status/history inspection remains available for routing state; ordinary task tools are not made safe or authorized by these tools.

| Tool | Operations | Purpose and boundary |
| --- | --- | --- |
| `freeflow_delegate` | `assign`, `replace` | Coordinator saves a contract for Executor. `replace` requires an explicit reason and a quiescent outstanding assignment; prior effects and evidence remain. |
| `freeflow_return` | `submit`, `retry` | Executor saves or deliberately revises a report, or retries the saved handoff without resubmitting text. `submit` takes `report`, `outcome` (`completed`, `partial`, or `blocked`), and optional `limitations`. A handoff must be last in its batch. |
| `freeflow_unit` | `status`, `history`, `assess`, `close` | Read-only `status`/`history` inspect routing state; Coordinator uses `assess` to restore a suspended assessment and `close` to record the unit disposition. `close` takes `outcome` (`accepted`, `cancelled`, or `deferred`) and an `assessment`; it does not complete a Track Work task or authorize delivery. |
| `freeflow_project` | `add`, `remove`, `inspect`, `list` | Executor selects eligible completed evidence for Coordinator when projection is enabled. References are canonical `ctx:<native-entry-id>` values. `remove` requires a reason; `list` supports `assignment` or `active` scope and a numeric cursor. |

The harness owns operation and event identities. Do not create a parallel ledger or supply IDs. Projection changes, a saved return, and one final handoff may share a bounded batch; do not mix a handoff with new ordinary task work.

## Context projection

Projection is disabled by default. With `projection: false`, both profiles receive ordinary Pi active context and `freeflow_project` is unavailable. With projection enabled, Executor works from ordinary active context while Coordinator receives common context plus selected Executor evidence. Selection is evidence selection, not an isolated context window or a pin against compaction.

A selected item must be an actually exposed, completed source on the active native ancestry. Selecting a call envelope does not select its result body. Native dependencies and the complete relevant call exchange are retained automatically; unselected result bodies may appear only as an omission marker, never as the original result. A valid selection remains saved when another item fails, while unresolved, stale, adverse, or target-representation problems remain explicit. A readiness result is not semantic proof of the report.

The current successful handoff and required native dependencies are retained automatically. On a corrected retry, the earlier substantive saved report must be restored when it is needed; a short retry explanation is not a replacement for that report. Saved reports and selections are persisted routing state independent of whether a later profile switch succeeds.

The new routing projection is not qualified in composition with the legacy Context Virtualization or Conversation History transforms. Do not enable either legacy capability together with `projection: true`. Context Virtualization and Conversation History remain independently available as standalone capabilities, and may still be used when Cognitive Routing projection is disabled.

## Persistence, uncertainty, and recovery

Routing state is recorded as native `freeflow-routing-v2` session entries. The runtime validates each transition before appending, reads the native append back from the live branch, and replays the selected ancestry for state. Native entries preserve assignments, reports, selections, assessments, controls, and transition evidence across switching and reloads; they are not a second task-memory store.

When existing or uncertain routing state must be reconciled, the runtime reads the persisted native session file through a strict read-only snapshot: bounded regular-file read, complete UTF-8/JSONL parsing, session identity and ancestry checks, and live-branch comparison. It does not patch the host session file, claim `fsync`, or promise exactly-once behavior. If persisted readback cannot establish an attempted event or the snapshot is divergent, routing blocks with explicit uncertainty. Do not repeat a potentially completed effect blindly.

New user attention suspends a saved Coordinator assessment rather than silently delivering stale report/evidence into the new interaction. Runtime State reports that the saved report/evidence is suspended. Once the saved assessment is again the intended activity, use `freeflow_unit` with `{"operation":"assess"}`; readiness and reservation checks must succeed before it resumes. A failed restoration leaves the assessment suspended.

After context loss, ancestry change, native model/thinking override, or an uncertain transition, recover Runtime State, the current unit and assignment, saved report, partial effects, selected evidence, and stopping conditions before task work. `/freeflow resume` is an explicit idle-host recovery command; it does not bypass reconciliation or authorize a new outcome.

## Controls and history

While the qualified host is idle, use:

```text
/freeflow profile coordinator
/freeflow profile executor
/freeflow profile auto
/freeflow profile history
/freeflow resume
```

`coordinator` and `executor` create manual holds. `auto` releases the hold and reconciles automatic Coordinator control. `history` displays read-only routing status and recent transition evidence. `/freeflow resume` resumes the saved routing responsibility after the runtime can establish the persisted state. Profile changes and resume are unavailable while the host is running.

The current source also wires `Ctrl+Shift+R` to cycle the Coordinator/Executor manual hold and `Ctrl+Shift+A` to release the hold to automatic Coordinator control when the native controls are present. This source wiring is not proof that an installed or stock host dispatches the behavior.

## Evidence boundary

Documentation and deterministic source/fixture checks can establish the v2 schema, native-entry mechanics, gating, projection rules, and failure contracts at their observed boundaries. They do not establish stock-Pi installation, PiFlow availability, universal model behavior, optimal routing, or production readiness.

## Related documentation

- [Capabilities](README.md)
- [System prompt architecture](../prompt-architecture.md)
- [Workflow](../workflow.md)
- [Pi integration](../integrations/pi.md)
- [PiFlow integration](../integrations/piflow.md)
- [Architecture](../architecture.md)
- [Release evidence](../release-evidence/README.md)
