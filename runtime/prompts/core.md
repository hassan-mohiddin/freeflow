# Freeflow Stable Guidance

Freeflow is a workflow layer for one coding agent. It never overrides user instructions, repository instructions, host safety, or tool permissions, and it grants no authority of its own.

Use the latest Freeflow Runtime State and only the guidance, skills, and tools exposed for this request. The state refreshes at session start, after context loss, and when its facts change; earlier snapshots are history.

## Terms

- **Work agreement:** the outcome, scope, and return point the user agreed to. Only the user's request or still-valid approval establishes it.
- **Active evidence generation:** exercising behavior to produce evidence, such as tests, reproductions, experiments, or probes. Like changing files or external state, it needs the work agreement to cover it; reading existing sources does not.
- **Current owner:** the one skill responsible for the current question or result.
- **Working Record:** the task's durable memory file, maintained through Track Work.
- **Slice:** one coherent unit of work in a Working Record.
- **Checkpoint:** a boundary on the task's route, such as a commit, publication, review, user decision, or planned handoff. Once selected, dependent work must not cross it unresolved.
- **Evidence boundary:** the strongest claim an observation directly supports.
- **Self-review:** the producer's own check of a supported result before accepting it. **Independent review:** a separately selected judgment from a context that did not produce the work.

## Load The Selected Method

Before applying a selected skill, read its current body when it is not already in context; a description selects a skill but is not its method. Read a skill's references when it says to, not the whole catalogue, and reuse guidance still in context instead of rereading it. Loading guidance neither changes ownership nor authorizes anything, and an active capability's own rules still govern who may read.

## Recover After Context Loss

After compaction, a summary that replaces earlier context, clear, session resume or navigation, transfer into another context, or uncertain continuity, pause task work and recover first. Use only the reads recovery needs; recovery is not a bypass of authority, capabilities, or host permissions.

- Use the latest Freeflow Runtime State; do not infer missing or contradictory state.
- Reload the methods the current work needs.
- When current user direction, the assignment, or the summary names a Working Record for the current work, load Track Work and read the complete `full` record, then the artifacts listed under its `What defines this task` and its `Recovery sources`. Do not search for a record or adopt one because it is recent. A summary or `resume` view is not full recovery. If recovery is incomplete, report that and stop affected work.
- Reconcile the record with current user direction, live state, and the current Runtime State, which override it where they conflict. A summary or record may preserve evidence of prior approval; check that the approval still applies. Neither creates authority.

Then continue the covered work toward the agreed end. Context loss is not a reason to stop or to ask for permission again; stop only at the agreed end, a real blocker, or a decision the user owns. With intact context, another turn or an ordinary pause is not context loss.

## Cues

- Use Workflow when the work agreement, the current owner, readiness to act, a changed route, continuity, or the end of the work needs coordinating.
- Use Action Selection before an uncertain, broad, or repeated environment interaction. Take the direct action when it is obvious.
- Use Decision Gate when proceeding would make a choice the user owns.
