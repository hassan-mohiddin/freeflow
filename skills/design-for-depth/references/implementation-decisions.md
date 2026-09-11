# Implementation Decisions

Read this before substantial implementation, or before writing its guiding design, when unresolved representation, identity, ownership, algorithm, or failure choices could invalidate significant dependent work. Skip it for a supported local change whose remaining mechanics do not alter those boundaries.

Use this method under Design for Depth and the current activity. It does not create another planning phase, document requirement, approval gate, or compute role.

## Identify What Implementation Would Still Have To Invent

Start from the accepted outcome, relevant source evidence, and existing design. Ask:

> Which remaining choices could change correctness, complexity, failure behavior, or force substantial dependent work to be redone?

Name the actual question, not a generic demand for more design. For example, deciding which occurrence identifies a source matters more than choosing Map versus array; deciding what survives a failed transfer matters more than choosing a retry helper.

For each consequential unknown, choose one route:

- **Evidence supports a mechanism:** select it and explain why it fits.
- **An environmental fact is missing:** identify the observation that distinguishes the alternatives before dependent implementation.
- **A user-owned boundary is unsettled:** return that choice through the current owner.
- **Only ordinary mechanics remain:** leave them to implementation and continue.

Do not invent APIs, future files, or stronger guarantees to complete the design. Nor should the user have to choose implementation syntax: explain user-owned consequences and resolve supported engineering details within the agreement.

## Choose The Representation And Mechanism

Develop only the decisions that answer the current question. Reuse supported design rather than filling every category:

| Decision | Make explicit when material |
| --- | --- |
| Representation and identity | Domain objects and independent lifetimes; what counts as the same occurrence; what must remain distinct |
| State and ownership | Authoritative facts, derived caches, transition owner, and permitted mutations |
| Algorithm and cost | Essential steps; collection keys and relationships; update/invalidation rules; work repeated as input grows |
| Effects and failure | Required ordering; what is accepted or visible at each boundary; what survives failure and what may be retried |
| Modules and dependencies | Who hides each decision; which callers consume the result; dependencies or coordination that must not spread |
| Evidence | Observable required behavior and a plausible wrong implementation the check must reject |

Use Design for Depth's interface, state/failure, and module references when their named questions need resolution; do not repeat their full methods here. Compare materially different approaches only when they remain viable. Prefer eliminating unnecessary coordination to hiding the same protocol behind another helper.

## Preserve The Decision, Not A Complete Patch

Communicate enough for another implementer, or your later context, to retain the chosen approach:

- the decision and its source basis;
- why it fits and the invariant it protects;
- the essential mechanism, including a small type or control-flow sketch when useful;
- the counterexample and distinguishing observer;
- required constraints versus suggested mechanics and local freedom;
- the evidence or condition that would invalidate the choice.

Use a paragraph, example, or compact table. Do not prescribe every loop or helper, or reproduce the whole program in prose. Naming a data structure without its keys, meaning, and maintenance rules is not useful algorithmic direction.

Keep durable decisions in the owning technical design; keep execution order in the Plan and changed understanding in task memory. A current assignment should carry the applicable decisions and relevant source section, not another complete copy of every artifact. A path or hash does not establish that its contents are available to the implementer.

## Check Realization Before Dependent Expansion

When an unfamiliar boundary could invalidate substantial later work, choose the first coherent implementation path that can disagree with the design. It may span several files and a failure case. A skeleton, happy-path result, or green summary alone may not exercise the decision.

Assess the actual implementation and observation: which important choices were realized, omitted, contradicted, or replaced with a supported reason? Check ownership, identity, ordering, and the observer—not fidelity to suggested filenames or helper syntax.

A precise sketch can be wrong. Preserve accepted behavior, stop dependent effects when the mechanism is invalidated, and resolve the affected choice through the current owner. Supported local corrections need no design restart. Once the boundary is established, reuse it rather than repeating this assessment after every edit.

## Examples

### Identity And Indexing

Weak direction: "Use a Map and avoid repeated scans."

Useful direction: "Keep native occurrence IDs as source identity. Equal bodies may identify several candidates; do not merge their occurrences. Let the source owner maintain the result-to-exchange relationship. Update appended sources and rebuild affected indexes after ancestry replacement. Check repeated equal bodies, late attribution, and a branch change; measure the repeated preparation path rather than only an isolated lookup. Helper layout is local. Reconsider the index if the source does not provide the assumed stable identity."

### Acknowledgment And Retry

Weak direction: "Make persistence idempotent and robust."

Useful direction: "The append owner distinguishes observed acknowledgment from an uncertain attempt. An equal entry in memory does not resolve an earlier failure. Validate before mutation; publish accepted state only at the supported acknowledgment boundary. Test append advancing memory then failing, followed by the identical operation: uncertainty must remain until supported reconciliation. Also test an acknowledged duplicate so the implementation does not reject every retry. Do not infer filesystem durability from readback. Reconsider the mechanism if the actual host boundary differs."

Stop when the next implementation has a supported approach and intentional local freedom, or its blocking question is explicit. Do not pursue a complete blueprint for later work whose premises remain unsettled.
