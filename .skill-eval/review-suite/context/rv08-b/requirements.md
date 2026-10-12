# Requirements

The change moves two routing transition rules into the state reducer, so every event is refused the same way whichever handler sends it. Before this change, the tool handlers enforced them alone.

1. A delegate event that starts a new assignment (one that does not replace an outstanding assignment) is refused with `recovery_outstanding` while an attached recovery is open.
2. A delegate event that replaces an outstanding assignment is refused with `unresolved_worker_execution` while a worker execution for that assignment is neither bound to an assistant entry nor interrupted.
3. Recovery cancellation is refused with `unresolved_worker_execution` while a worker execution started for that recovery is neither bound to an assistant entry nor interrupted.
4. Closing a unit is refused with `unresolved_worker_execution` while a worker execution started for the attached recovery is neither bound to an assistant entry nor interrupted.
5. Closing a unit over an outstanding assignment is refused with `unresolved_worker_execution` while a worker execution for that assignment is neither bound to an assistant entry nor interrupted.
6. Once the blocking execution is interrupted, the same cancellation or close is accepted. Settled runs, reloads, navigation and resume retire worker executions this way, so a legitimate close or cancellation is not blocked afterwards.
7. A refused event leaves the state unchanged.
