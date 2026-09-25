# Helper Mode

Judgment for placing work when Runtime State shows `Delegation: helper`. The core skill's Rules still apply.

Helper mode is for the best output quality. Coordinator implements; Helper takes everything that does not need Coordinator-level reasoning. There is no Executor to invoke or simulate.

## Delegate By Default

Goal: Coordinator's premium compute goes to the work that needs it, and nothing else.

Default: delegate a step unless it needs Coordinator-level reasoning. Keep that category narrow:

- governing decisions and design;
- substantive implementation, meaning changes whose behavior or failure needs engineering ownership;
- the conversation with the user.

Helper takes the rest: gathering sources and skills, investigating bounded questions, preparing authorized setup, running existing checks and validations, separate record maintenance, and straightforward settled changes that are local, reversible, and easy to check. Helper can reason, compare evidence, spot contradictions, and choose local mechanics; it is not limited to copying facts.

The failure to prevent is under-delegation: classifying every step as Coordinator-level, so Coordinator does all the gathering, checking, and bookkeeping itself and the mode saves nothing.

## Do Not Split What Belongs Together

Goal: handoffs save more than they cost.

Keep a tightly coupled edit, check, and interpret loop with Coordinator. Moving each check to Helper adds a contract, a ramp-up, and a return, and forces Helper to rebuild the context Coordinator already holds.

Hand off results that stand on their own:

| Situation | Placement |
| --- | --- |
| Before implementing, the sources, callers, and conventions for the planned change need gathering. | Helper gathers; Coordinator implements from the result. |
| Mid-implementation, Coordinator wants to know which acceptance requirements the candidate meets, which lack a check, and which test edits changed coverage. | Helper runs a read-only cross-check against the Slice's acceptance requirements and returns without patching. |
| After a feature lands, several record entries, a validation run, and a formatting pass are due. | Helper, as one assignment. |
| Coordinator just ran a failing test and knows the fix. | Coordinator fixes and reruns; no handoff. |
| One line of the Working Record needs updating in the middle of Coordinator's own work. | Coordinator updates it; a handoff would cost more than the edit. |

If Helper reaches substantive work outside its assignment, it returns findings and partial state, and Coordinator takes the next decision.

## Route Preparation

Helper gathers; Coordinator implements. Gathered evidence must reach Coordinator: with projection on, Helper selects it at return; with projection off, Coordinator sees Helper's work in ordinary history. Coordinator forms the execution forecast itself.

## Coordinator's Own Production

Coordinator's direct implementation passes through no handoff, and handoffs are part of how routing keeps long work on course. Rely on Execute Work's forecast and on Workflow's check before each continuation: does the next change meet a requirement, repair a demonstrated defect, or only add an optional guarantee? Do not invent assignments for your own work to recreate that boundary, and use no ACT_BOUNDED; direct production is what this mode is for.

Coordinator may update the Working Record directly as part of its own work. When closing a Slice, fold the writeback into Helper work already going out, or do it directly when it is one small update.
