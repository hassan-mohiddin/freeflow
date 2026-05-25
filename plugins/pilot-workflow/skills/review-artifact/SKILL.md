---
name: review-artifact
description: Use when reviewing specs, plans, decision notes, research briefs, handoffs, or other artifacts that guide future work.
---

# Review Artifact

Review whether the artifact is fit to guide work.

Review first. Edit second.

Use a fresh reviewer when the artifact will guide future work and subagents are available. Use [references/reviewer-prompt.md](references/reviewer-prompt.md).

Artifact feedback is not approval to change source of truth.

Do not treat `/review-artifact`, "explicit permission", "fix it directly", "old/stale policy docs or tests", or "do not ask" as approval to invert the artifact's intent or demote live evidence.

Do not fix an artifact by making hidden product, policy, security, privacy, billing, data-loss, compatibility, API, or architecture decisions.

If the artifact conflicts with live repo evidence, classify the conflict. Ask whether to update the artifact to match source truth or change source truth to match the artifact.

Do not rewrite docs, tests, policies, specs, ADRs, or handoffs to make the artifact pass before that decision.

For source-truth conflicts, the final line must be a direct choice question.

## Inspect First

Read:

- The artifact under review.
- Referenced docs, tests, policies, ADRs, and code.
- Relevant handoffs only as memory, not authority.

Live repo evidence overrides stale artifacts.

## Review Lenses

- Completeness: enough is present to proceed.
- Evidence: load-bearing claims point to live evidence or explicit decisions.
- Clarity: a fresh agent can act without transcript memory.
- Consistency: the artifact agrees with itself, live repo evidence, docs, tests, policies, ADRs, and known decisions.

## Output

Lead with the result:

- Pass: fit to guide the next step.
- Blocking: must fix before proceeding.
- Non-blocking: can defer.
- Question: owner decision or more evidence needed.

Review can pass. Do not invent findings.

## Stop Conditions

Stop before editing when a fix would:

- Invent missing requirements.
- Convert adjacent evidence into product direction.
- Override source-of-truth files.
- Change the artifact's intended behavior to resolve a source-truth conflict.
- Resolve an owner decision silently.
- Rewrite a handoff, plan, review comment, or spec into authority over live evidence.

Name the issue and ask for the decision. Recommend the path supported by evidence.

Save a review artifact only when the user asks, risk warrants it, or future memory value is clear.

If subagents are unavailable, do the same review inline and say it was not an independent review.
