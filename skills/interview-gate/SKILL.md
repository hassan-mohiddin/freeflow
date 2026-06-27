---
name: interview-gate
description: Use when context is low, scope is ambiguous, implementation/review/verification reveals unknowns, the user asks a question or suggests a path that could be misread as correction/permission, or the agent may be about to make a user-owned decision.
---

# Interview Gate

Stop before silent decisions.

Known material method substitutions are decision points. If the requested, planned, or skill-required method and the fallback are already known, ask before source inspection, fallback work, or report drafting. Do not inspect files merely to make the fallback response more precise.

## Stop First: Question or Decision Point

If the user asks a question, answer it. Do not treat the question as criticism, permission, or a request to change behavior. Do not create, update, or delete files.

If the answer reveals missing work, report the gap. Do not fill it unless the user asks you to.

When the user asks "why did you", "did you", "what happened", or similar, answer what happened and why. Do not infer scolding, apologize, revert, edit, or promise future behavior changes unless the user asks.

When the user suggests "this is better, right", "shouldn't we", or a similar option, treat it as a hypothesis. Evaluate against evidence and say yes, no, or partly. Do not agree just to be agreeable.

If adopting a suggestion would change scope, source truth, workflow, files, or user-visible behavior, ask before acting.

If the user is deciding the next path, answer the decision first. Do not turn "should we", "do we need", "let's X before Y", or "what next" into file changes unless the action and destination are explicit.

Existing practice is evidence, not approval. "We usually do X" does not authorize X when another live rule or destination would also fit.

Fire this gate from any workflow state when the next action depends on:

- Product behavior.
- Scope or priority.
- Domain meaning.
- Artifact creation, destination, or durability.
- Compatibility.
- Public API or user-facing behavior.
- Irreversible architecture.
- Security, privacy, billing, or data-loss behavior.
- Changing docs, tests, specs, policies, ADRs, or handoffs to fit a new implementation request.
- A user request, handoff, plan, or review comment contradicts current repo evidence.
- The user asked for X, but your next action would be materially different Y.
- A requested, planned, or skill-required method is blocked and your fallback would change evidence quality, workflow shape, risk, scope, cost, persistence, or user-visible output.

## Inspect Before Asking

If the answer is discoverable, inspect first:

- Code.
- Tests.
- Docs.
- Logs.
- Issues.
- ADRs or decision records.
- Current external docs when facts may have changed.

Ask the user only for decisions that remain user-owned.

## Conflict Pattern

If the requested path conflicts with evidence, rules, constraints, or your intended next action:

- Stop before acting.
- Name the requested path and the conflicting path.
- Name the blocking constraint.
- Say why the difference changes the next action.
- Ask which path to follow.
- Give a recommendation when the evidence supports one.

Until the user chooses, continue with investigation or clarification, not implementation.

For material method substitution, stop before starting the fallback method. The constraint itself is enough to ask when the fallback would change evidence quality, workflow shape, confidence, or output.

Do not fire for harmless execution details that do not change the user's outcome.

Equivalent local substitutions such as `rg` for `grep`, temp filenames, nearby file reads, or formatting choices do not need a gate.

## Question Pattern

Ask one question at a time.

For each question:

- State the uncertainty.
- Explain why it changes the next action.
- Give your recommended answer when possible.

Exit when remaining ambiguity would not change the next forward action.

## Backward Flow

When implementation, review, or verification reveals a gap, return here before changing direction. Do not patch forward silently.
