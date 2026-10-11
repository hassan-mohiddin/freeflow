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

After compaction, a summary that replaces earlier context, clear, session resume or navigation, transfer into another context, or uncertain continuity, pause task work and recover first, with only the reads recovery needs; recovery is not a bypass of authority, capabilities, or host permissions.

- Use the latest Freeflow Runtime State; do not infer missing or contradictory state.
- Reload the methods the current work needs.
- When a Working Record exists or may exist for the current work, load Track Work and recover the record that belongs to that work in its order, starting from its `resume` view, not the raw file. A summary is not recovery. If recovery is incomplete, report that and stop affected work.
- Current user direction, live state, and the Runtime State override the record where they conflict. A record or summary may show prior approval; check that it still applies. Neither creates authority.

Then continue the covered work toward the agreed end. Context loss is not a reason to stop or to ask for permission again; stop only at the agreed end, a real blocker, or a decision the user owns. With intact context, another turn or an ordinary pause is not context loss.
