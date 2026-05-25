---
name: mode-contract
description: Use when a user asks to set, change, infer, or discuss conversation/workflow/strict-workflow mode, or when task risk suggests recommending a workflow mode.
---

# Mode Contract

Use exactly three modes.

## Modes

**Conversation mode**: discussion, explanation, critique, exploration, quick analysis.

- Answer questions; do not act on them.
- No workflow pressure.
- No required artifacts.
- No plan/spec requirement.
- Ask only when needed for the answer.

**Workflow mode**: normal consequential work.

- Use the workflow as a guide.
- Ask or inspect when ambiguity would change the next action.
- Create artifacts only when they preserve decisions, reduce risk, or enable handoff.
- Verify before completion claims.

**Strict-workflow mode**: high-risk or hard-to-reverse work.

- Use stronger gates.
- Require explicit decisions for security, privacy, billing, data loss, migrations, public APIs, compatibility, deployment, and large architecture changes.
- Require explicit confirmation before changing source-of-truth artifacts such as docs, tests, specs, policies, ADRs, or handoffs when they contradict the requested implementation.
- Recommend this mode when risk warrants it, but do not silently switch unless the user configured it as default.

## Inference

- If the user is talking or asking a conceptual question, use conversation mode.
- If the user asks to implement, fix, research for action, review, or plan, use workflow mode.
- If the task is high-risk, recommend strict-workflow mode and ask for confirmation.
- If implementation would require overriding existing docs, tests, specs, policies, or established behavior, recommend strict-workflow mode and ask before editing.

## User Control

The user owns mode changes. You may recommend a mode; the user decides.

## Commands And Defaults

Recognize only:

```text
/workflow conversation
/workflow workflow
/workflow strict-workflow
```

These switch mode for the current task or conversation only. Do not persist them, create current-mode files, or edit config unless the user explicitly asks to change the repo default.

When the repo default matters, read `.pilot-workflow/config.json`. If it is missing or invalid, fall back to `workflow` and report the config issue when relevant.

Persist only explicit default requests, such as "make strict-workflow the default for this repo." Update `.pilot-workflow/config.json` with only:

```json
{
  "defaultMode": "strict-workflow"
}
```

Use the requested valid mode. Do not add current mode, task, phase, version, or activation-path fields.

Direct skill calls are manual state selection. If the user calls a workflow segment directly, operate in that segment while still using the interview gate for user-owned decisions.
