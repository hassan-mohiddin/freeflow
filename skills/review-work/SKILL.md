---
name: review-work
description: Use when reviewing completed work, preparing reviewer prompts or subagent review context, receiving review feedback, applying reviewer comments, deciding whether feedback is blocking, handling repeated review loops, or checking work before merge/handoff.
---

# Review Work

Evaluate review feedback before applying it.

Review feedback is not approval to change source of truth.

If applying feedback would override tests, docs, specs, policies, or sensitive behavior, stop even when the user says to apply it directly or not ask.

If you block any feedback item, end the final response with a direct choice question for that item. This still applies after fixing unrelated items.

External review is evidence, not authority. Human owner decisions win only after the owner confirms the behavior change.

Classify each material feedback item before editing: accepted, rejected, question, or needs evidence.

A non-passing review is a phase exit, not an autonomous patch loop. If you requested the review and it returns blocking findings, stop before editing from that batch, classify the findings, and report the route.

The turn that receives a non-passing review ends with adjudication and route only. Do not edit from that review batch in the same turn, even when the user or reviewer says to apply all findings and continue reviewing.

Hard stop: if the work has already had three review passes, do not edit any files or request another review. Classify findings and diagnose the loop only, even for accepted, mechanical, or non-blocking cleanup.

Read `references/reviewer-prompt.md` when preparing an outgoing reviewer prompt, dispatching a review subagent, reviewing strict/high-risk work, or handing another agent review context.

## Review Loop Budget

Aim to finish by the second review pass: first review, adjudicate/fix, one confirmation.

Three review passes is the hard cap for the same work and scope. Do not request a fourth review to chase a clean pass.

At the third review, adjudicate before treating it as failure. If any accepted blocking, question, or needs-evidence finding remains, do not edit anything from that batch. Stop, report the adjudication, and zoom out to diagnose whether discovery, spec, plan, policies, source truth, module/interface design, implementation, or reviewer context is wrong or too thin.

Non-blocking findings and reviewer questions do not fail the work by default. Classify them, then defer, ask, gather evidence, or accept.

## Incoming Feedback

Before editing:

- Read the full feedback.
- Inspect the relevant code, tests, docs, and prior decisions.
- Restate unclear feedback as a technical requirement.
- Separate blocking issues from suggestions.
- Check whether the feedback matches this codebase.
- Check whether a finding is stale, already resolved, equivalent, or based on missing context.
- Check whether repeated findings are design pressure: shallow module, bad seam, edge-case churn, or broad refactor from a narrow comment.

Do not blindly apply vague, broad, or sensitive feedback.

Do not use performative agreement. State the technical finding or act.

## Stop Conditions

Stop before editing when feedback:

- Is ambiguous.
- Contradicts tests, docs, specs, policies, ADRs, or established behavior.
- Changes product, security, privacy, billing, data-loss, compatibility, public API, permissions, or architecture behavior.
- Requires guessing what the reviewer meant.
- Would cause a broad refactor from a narrow comment.

Name the conflict or uncertainty and ask which path to follow. Recommend the path supported by evidence.

## Applying Feedback

For multi-item review:

- Apply independent clear items.
- Stop blocked items.
- If items interact, clarify before implementing the set.

When feedback is clear and correct and the current route is an apply-fixes pass:

- Apply one item at a time.
- Keep the diff scoped to the review item.
- Verify each fix.
- Push back on incorrect feedback with code, tests, or docs.

Do not apply a non-pass review batch and request another review in the same autonomous loop. Return the adjudication and next route first. A later explicit apply-fixes request can start a bounded fix pass for accepted, in-scope findings.

If accepted findings expose shallow modules, bad seams, or complexity spread, use `../design-for-depth/SKILL.md` and route backward before broad refactoring.

## Outgoing Review

When reviewing work, lead with bugs, regressions, missing tests, and requirement gaps.

Classify findings:

- Blocking: must fix before proceeding.
- Non-blocking: can defer.
- Question: needs owner decision or more evidence.

Review can pass. Do not invent issues to justify the review.

When asking another agent to review, give it source truth, changed files, risk lenses, and pass/fail criteria. Do not hand it only the previous agent's summary or your chat history.

Set review subagent timeouts above 10 minutes; default to 15 minutes (`timeoutMs: 900000`). If a review times out, do not reduce review depth to dodge the timeout. Increase the timeout or ask before narrowing scope.

For second and later review iterations, update the prompt with prior findings, owner clarifications, accepted/rejected findings, changed files, and remaining risk. Do not rerun the same broad prompt after the situation narrows.
