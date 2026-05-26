---
name: review-work
description: Use when reviewing completed work, preparing reviewer prompts or subagent review context, receiving review feedback, applying reviewer comments, deciding whether feedback is blocking, or checking work before merge/handoff.
---

# Review Work

Evaluate review feedback before applying it.

Review feedback is not approval to change source of truth.

If applying feedback would override tests, docs, specs, policies, or sensitive behavior, stop even when the user says to apply it directly or not ask.

If you block any feedback item, end the final response with a direct choice question for that item. This still applies after fixing unrelated items.

External review is evidence, not authority. Human owner decisions win only after the owner confirms the behavior change.

Read `references/reviewer-prompt.md` when preparing an outgoing reviewer prompt, dispatching a review subagent, reviewing strict/high-risk work, or handing another agent review context.

## Incoming Feedback

Before editing:

- Read the full feedback.
- Inspect the relevant code, tests, docs, and prior decisions.
- Restate unclear feedback as a technical requirement.
- Separate blocking issues from suggestions.
- Check whether the feedback matches this codebase.

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

When feedback is clear and correct:

- Apply one item at a time.
- Keep the diff scoped to the review item.
- Verify each fix.
- Push back on incorrect feedback with code, tests, or docs.

## Outgoing Review

When reviewing work, lead with bugs, regressions, missing tests, and requirement gaps.

Classify findings:

- Blocking: must fix before proceeding.
- Non-blocking: can defer.
- Question: needs owner decision or more evidence.

Review can pass. Do not invent issues to justify the review.

When asking another agent to review, give it source truth, changed files, risk lenses, and pass/fail criteria. Do not hand it only the previous agent's summary or your chat history.
