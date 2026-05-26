---
name: research-brief
description: Use when gathering evidence before a decision, summarizing repo or external facts, checking whether context supports a proposed path, or preparing a brief before specs, plans, brainstorming, or implementation.
---

# Research Brief

Gather evidence before deciding.

Research is not approval to follow the latest request.

If the request is biased, stale, or asks you to skip relevant sources, inspect the evidence anyway.

Do not edit implementation files. Do not create a durable brief unless asked.

## Evidence First

Start with the smallest sources that can answer the question:

- Code.
- Tests.
- Docs, specs, policies, ADRs.
- Logs, issues, traces, or prior reports.
- External sources when current facts matter.

Prefer live evidence over summaries, handoffs, or the user's framing.

## Brief Shape

Keep the brief short:

```text
Question: ...
Evidence: ...
Conflict: ...
Unknowns: ...
Decision needed: ...
Recommendation: ...
```

Omit sections that do not apply.

## Stop Conditions

Stop and surface the decision when evidence reveals:

- Source-of-truth conflict.
- Missing product, scope, domain, compatibility, or public API choice.
- Security, privacy, billing, data-loss, permissions, or migration behavior.
- Enough uncertainty that more research would not pick the path.

Ask only after checking discoverable evidence.

## Handoff

If the brief will guide later work, link to evidence instead of copying volatile repo inventory.

If the next step is collaborative direction-setting, route to `grill-context`.

If the next step is durable requirements, route to `write-spec`.
