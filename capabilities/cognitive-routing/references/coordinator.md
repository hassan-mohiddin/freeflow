# Cognitive Routing: Coordinator

Read this as Coordinator under Automatic control, before your first command or edit and again after context loss. The [Cognitive Routing](../SKILL.md) skill's Terms and Rules apply, including the limit on Coordinator's own environment work in `executor` and `both` modes. This reference is judgment, except the conditions ACT_BOUNDED sets, which bind.

## Decide Where Work Runs

Goal: each result is produced where the total cost is lowest without losing quality.

Delegate when the expected saving in cost or quality exceeds the handoff, the ramp-up, the assessment, and the likely corrections. The kind of difficulty usually suggests the owner:

- missing facts about the environment: a worker observes;
- an unresolved design or governing choice: Coordinator;
- settled mechanics: a worker, or a script when the work is deterministic and repeated;
- a decision the user owns: Coordinator asks, using [Discuss Work](../../../skills/discuss-work/SKILL.md), and keeps its decision list; never a worker.

Default: follow the section for your mode below. Keep a tightly coupled edit, check, and interpret loop with one producer; hand off results that can be separated from it. A separate multi-entry record update qualifies; a one-line update in the middle of your own work does not. A read-only check of the candidate against the Slice's acceptance requirements qualifies even mid-implementation, because it gives Coordinator a different result, not a repeat.

Decide by the responsibility handed over and its consequences, not by whether it reads or writes, whether the output is prose or code, the file type, the line count, the tool count, or the models' names and effort labels. Choosing a worker never substitutes for the user's authorization. Do not require a worker to fail before choosing a stronger owner. If a return shows the responsibility is different from what you assumed, reassess the placement rather than repeat the assignment more forcefully.

Direct Coordinator work needs no invented assignment, projection, or return. Authorship the user assigns to Coordinator means the user asked Coordinator itself to write a particular artifact; a general request such as "write the plan" does not select it, and it authorizes nothing beyond that artifact. Do not take over outstanding worker work without reconciling its accepted responsibility and partial effects.

## Place Work By Mode

### Helper

Helper mode is for the best output quality. Coordinator implements; Helper takes everything that does not need Coordinator-level reasoning. There is no Executor to invoke or simulate.

Default: delegate a step unless it needs Coordinator-level reasoning. Keep that category narrow:

- governing decisions and design;
- substantive implementation, meaning changes whose behavior or failure needs engineering ownership;
- the conversation with the user.

Helper takes the rest: gathering sources and skills, investigating bounded questions, preparing authorized setup, running existing checks and validations, separate record maintenance, and straightforward settled changes that are local, reversible, and easy to check. Helper can reason, compare evidence, spot contradictions, and choose local mechanics; it is not limited to copying facts.

The failure to prevent is under-delegation: classifying every step as Coordinator-level, so Coordinator does all the gathering, checking, and bookkeeping itself and the mode saves nothing. Moving each check of your own edit loop to Helper fails the other way: it adds a contract, a ramp-up, and a return, and forces Helper to rebuild the context you already hold.

| Situation | Placement |
| --- | --- |
| Before implementing, the sources, callers, and conventions for the planned change need gathering. | Helper gathers; Coordinator implements from the result. |
| After a feature lands, several record entries, a validation run, and a formatting pass are due. | Helper, as one assignment. |
| Coordinator just ran a failing test and knows the fix. | Coordinator fixes and reruns; no handoff. |

If Helper reaches substantive work outside its assignment, it returns findings and partial state, and Coordinator takes the next decision.

Gathered evidence must reach Coordinator: with projection on, Helper selects it at return; with projection off, Coordinator sees Helper's work in ordinary history. Coordinator forms the execution forecast itself.

Coordinator's direct implementation passes through no handoff, and handoffs are part of how routing keeps long work on course. Rely on Execute Work's forecast and on its check before each continuation (Assess The Return, below). Do not invent assignments for your own work to recreate that boundary, and use no ACT_BOUNDED; direct production is what this mode is for. Coordinator may update the Working Record directly as part of its own work. When closing a Slice, fold the writeback into Helper work already going out, or do it directly when it is one small update.

### Executor

Executor mode is the main cost saver. A cheaper Executor does the environment work: investigation, preparation, artifacts, implementation, checks, and record maintenance. Coordinator plans, writes contracts, assesses, and talks to the user, and executes nothing itself beyond the skill's listed exceptions, such as ACT_BOUNDED. The saving comes from two places: projection keeps Executor's working trail out of Coordinator's context, and precise contracts keep Executor from searching.

Coordinator may first commission evidence or a proposal, interpret what comes back, and then commission production. Executor gathers; projection carries the selected evidence to Coordinator; the next contract uses it to narrow Executor's search. Do not add a gathering pass when Executor already has an adequate basis, and do not pre-solve every detail before any evidence exists.

Record maintenance goes to Executor, folded into an assignment already going out rather than sent as a handoff of its own.

The failures to prevent are weak contracts that cause correction cycles, over-specified contracts that move the work back to Coordinator's price, and weak evidence that forces reassessment.

### Both

Both mode is the middle ground between quality and cost. Executor does consequential work, including code; Helper does support; Coordinator plans, writes contracts, assesses, and talks to the user. Every assignment names its worker with `worker: "helper"` or `worker: "executor"`.

Default: Executor for results whose behavior or failure needs engineering ownership; Helper for gathering, checks, setup, record maintenance, and small settled changes.

| Situation | Worker |
| --- | --- |
| Find the callers, contracts, and conventions the next change will touch. | Helper |
| Implement the change and its tests. | Executor |
| A one-line authorization change with security consequences. | Executor: small, but consequential. |
| A read-only audit that decides whether the design holds. | Executor: no writes, but substantive judgment. |
| Rerun the validation suite and the formatter after Executor's change. | Helper |
| Update several record entries after an accepted result. | Helper, or folded into an assignment already going out. |

The failure to prevent is misplacement: a consequential change given to Helper because it is short, or Executor spent on pure gathering.

These are available routes, not phases. A unit may use only Helper, go straight to Executor, or keep one coherent result with Executor through its checks and corrections. A typical route: Helper gathers; Executor's contract points at what Helper found instead of asking it to explore; Coordinator receives what it needs through projection. After implementation, Helper can run follow-up checks with Executor's context already present. Recheck a fact only when its freshness matters or its source is no longer available.

## Prepare The Route Before Delegating Production

Goal: the implementer starts with what it needs, and nobody gathers in the premium profile what the route could have predicted.

[Execute Work](../../../skills/execute-work/SKILL.md)'s route preparation applies. Routing adds:

- Coordinator plans the route and may read skills directly to know which methods the assignments will need.
- Before implementation, commission the context gathering the predictable steps need, so the implementer starts with it. Who gathers, and how the evidence reaches Coordinator, depends on the mode; see its section above.
- The implementing producer forms the execution forecast described in Execute Work under Establish The Execution Basis. When a worker implements, Coordinator supplies the governing decisions and the worker forms the forecast; do not write the patch for it.

## Write A Contract That Carries The Decision

Goal: the worker can act correctly on the first attempt without re-deriving what Coordinator already knows.

Coordinator's judgment reaches the work only through the contract. Put the actual contract in `delegate_work(operation: "assign")`. In `both` mode, set `worker` to `helper` or `executor`; with one enabled worker the tool infers it. Write for what the worker can see, not what you remember:

- the required result, why it matters, and the method to use;
- established facts, accepted decisions, and open questions;
- scope, order, constraints, permitted effects, and remaining local freedom;
- behavior for the cases the request does not mention but the change touches: other entry points, sibling operations, data already written, and work that runs at the same time or on a schedule;
- the contracts the worker must not choose: names, messages, interfaces, file locations, and dependencies, exactly as they must appear. Take each from the request, the repository's conventions, or the user; take one they leave open to the user before delegating;
- the evidence you need to assess the result;
- when to return, including when a premise or governing choice changes.

State each requirement as the outcome for a named thing ("each caller listed below still gets X"), without an escape clause such as "unless needed" or "as today": a cheaper model applies an escape clause literally. When behavior elsewhere must be preserved, say where the change belongs and what each named caller must still get: "keep what callers rely on today" alone can steer a worker away from a correct fix in shared code.

When unresolved representation, ownership, or failure choices could invalidate the work, settle them first with Execute Work's [design](../../../skills/execute-work/references/design.md) reference. Your most valuable contribution is framing the problem so the worker finds it straightforward. For a consequential or repeatedly misunderstood property, name the mechanism and why it fits, the plausible wrong approach, and the observation that tells them apart:

```text
Weak:   Add caching to the config loader.
Strong: Cache the parsed config per file path and invalidate when the file's
        modification time changes. Two loads of an unchanged file parse once;
        an edit between loads must be seen. A process-lifetime cache looks
        right and passes a single-load test but serves stale config, so check
        with an edit between two loads.
```

Give more structure where the worker has shown difficulty or the property is easy to get subtly wrong, and more freedom where the mechanics are settled. Signals the balance is off:

- The worker returns work that misses an unstated decision: the contract left it implicit.
- The contract is longer than the change and reads like a patch: Coordinator has done the work at premium price, and the worker only transcribes it.
- The same misunderstanding recurs: change how you represent the problem, not how forcefully you state it.

A gathering assignment names what must be learned, not a guessed implementation. Request evidence by the claim it must support, such as the decisive test output, the changed interface, or the contradicting observation, since its refs do not exist yet. Requesting everything moves the worker's trail into Coordinator's context and cancels the saving; requesting too little forces a recovery round. What you request is a minimum, and workers also return material discoveries and counterevidence. Shared history and provider caching do not convey unspoken direction, and a filename does not mean its content is available to the worker.

Size an assignment to include the work, its local checks, the expected corrections, and preparing the return. Shorten it when an unfamiliar boundary could invalidate much dependent work. Do not supervise every command, and do not delegate the whole objective to avoid later judgment. A negative result can complete a gathering or experimental assignment.

Use `replace` only for quiescent outstanding work whose unit outcome still holds. State why the direction changed, preserve partial effects and uncertainty, and choose the worker again in `both` mode. Do not replace returned work, or close and reopen a unit to escape unfinished responsibility.

## Assess The Return

Goal: accept only what the evidence supports, and choose the next work from the actual gap.

Assess the report and evidence you received. Ordinary assessment needs neither routine inspection nor an `assess` call; `assess` restores a suspended evidence view after new user input paused it.

For a material claim, compare the accepted property, the observation actually made, the decisive assertions, the candidate's identity, and the result. A confident report or a green suite cannot fill a missing link. Keep unsupported required claims open and stop dependent work. Check the actual state before calling something a defect or crediting a fix.

Assess your own direction too: did the contract leave a consequential decision implicit, over-constrain the mechanism, choose the wrong check, or place the work wrongly? A worker that asked no questions has not shown the contract was sufficient; missing specification shows in the result, as a plausible but different name, location, or behavior. Improve the next contract from the answer.

Before commissioning more work, ask whether it meets an accepted requirement, repairs a demonstrated defect, or only adds an optional guarantee; Execute Work owns that test. Then choose from the gap:

- **Supported result:** continue with the next covered work, or accept the outcome.
- **Evidence omitted but it exists:** recover it (below) before investigating again; absence from your view does not mean the action never happened. Selected evidence is not omitted: it stays in your view where the worker produced it, so look there before recovering it.
- **Missing or inadequate observation:** request the observation that decides it, without changing the required property.
- **Supported defect:** assign the correction and affected checks to the owner its responsibility needs.
- **Invalidated approach or unclear cause:** revise the direction or commission diagnosis rather than repeat the demand.
- **User-owned choice:** take it to the user before dependent work.

Repeated failure needs a changed premise, check, contract, working set, or mechanism, not lower acceptance or endless repair. Reuse adequate producer verification; a worker's audit in the same session is not independent review, which remains a separate Review Work choice.

Before completed Slice closure, state your assessment of the Slice's result and evidence, resolve material contradictions, and confirm its Checkpoints are settled. Then direct the [Track Work](../../../skills/track-work/SKILL.md) closure through whichever route your mode allows, preferably folded into work already going to that profile rather than a handoff of its own. A prior "close it if green" instruction cannot stand in for assessing results you have not seen. Workers may record factual progress while the Slice is open; a worker writing the closure returns instead if new evidence contradicts the accepted basis.

Use `routing_unit(operation: "close")` when the unit's outcome is supported, or to record an authorized `cancelled` or `deferred` outcome. Closing a unit does not complete a Slice or task, clear history, or authorize a commit or delivery. Continue covered work to the agreed return point.

## Recover Missing Evidence For An Assessment

Outstanding assignments use ordinary continuation, not this. For the current returned assessment, Coordinator uses `routing_unit(operation: "recover")` with the missing-evidence question, any exact task-file `paths`, and any captured result ids in `results` (a context ref such as `ctx:1a2b3c4d` goes in the request instead; the worker selects it). Recovery belongs to the assignment's recorded worker. Preserve the unit, assignment, original report, outcome, revision, selections, and assessment.

A separate recovery assignment fits only when no existing assignment or assessment needs preserving. Coordinator uses `cancel-recovery` when the lookup is no longer needed; the original report and assessment remain. Deliver the supplement or cancel recovery before `assess`; new user input does not settle recovery. Do not simulate recovery by replacing an assignment/report or opening a new unit.

## ACT_BOUNDED: Inseparable Judgment And Action

In `executor` and `both` modes, Coordinator may do other environment work only when judgment and action cannot be separated and delegating would lose something concrete. Examples: synthesizing a governing artifact when a complete contract would already be the artifact; intervening result by result in sensitive work. Task size, convenience, fewer switches, a failed recovery, or a preference for premium compute do not qualify, and separable production does not become judgment by being relabelled.

Before acting, state ACT_BOUNDED with its scope, expected result, existing authority, stop condition, the inseparable judgment, and what delegation would lose. Stay inside that scope; end on completion, interruption, context loss, changed applicability, or before delegating again. It grants no permission, assignment, or acceptance. Helper-mode Coordinator production needs no ACT_BOUNDED.
