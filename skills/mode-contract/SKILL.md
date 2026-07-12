---
name: mode-contract
description: Use when a user asks to set, change, infer, or discuss conversation/workflow/strict-workflow mode, or when task risk suggests recommending a workflow mode.
---

# Mode Contract

Use exactly three modes.

## Modes

**Conversation mode**: non-mutating discussion, explanation, critique, exploration, quick analysis, and planning in chat.

- Answer questions; do not act on them.
- You may inspect source, read files, and run safe read-only commands when needed for the answer.
- Do not edit, create, delete, commit, push, run mutating commands, or otherwise change repo/system state.
- Do not perform implementation or other consequential work that changes files, behavior, source truth, or durable project state.
- If the user asks for mutating or consequential work, stop and require switching to `workflow` or `strict-workflow` before acting. Do not proceed in conversation mode, even if pressured.
- No workflow pressure.
- No required artifacts.
- No plan/spec file requirement.
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

## Effective Mode And Recommendations

Use the effective mode supplied by runtime context or valid repo config. Task type does not silently change it: a conceptual question does not switch to conversation, and an implementation request does not switch to workflow.

- In conversation mode, answer and inspect read-only. Require an explicit switch before edits, file creation, commits, pushes, or other mutation.
- In workflow mode, use the adaptive workflow for consequential work.
- In strict-workflow mode, apply the stronger gates above.
- For high-risk work, recommend strict-workflow mode and ask for confirmation; do not switch automatically.
- If implementation would override docs, tests, specs, policies, or established behavior, ask before editing and recommend strict-workflow when the risk warrants it.

When runtime mode evidence is unavailable, read `.freeflow/config.json`. If it is missing or invalid, fall back to workflow mode and report the config issue when relevant. Do not infer a different mode merely from whether the request is conversational or mutating.

## User Control

The user owns mode changes. You may recommend a mode; the user decides.

## Commands And Defaults

Keep two scopes separate:

- `defaultMode`: persisted repo default in `.freeflow/config.json`.
- Current mode: task, conversation, or session override. Do not persist it in repo config.

Recognize only:

```text
/freeflow mode conversation
/freeflow mode workflow
/freeflow mode strict-workflow
/freeflow mode reset
```

The three mode-setting commands switch mode for the current task, conversation, or host session only. `/freeflow mode reset` clears the current override and returns to `defaultMode`; it is a command, not a fourth mode.

Do not persist current mode, create repo state files, or edit config unless the user explicitly asks to change the repo default.

Phrases like "from now on", "until I say otherwise", or "for this repo" still do not persist mode unless paired with an explicit default change request.

When the repo default matters, read `.freeflow/config.json` and apply the fallback above.

Persist only explicit default requests, such as "make strict-workflow the default for this repo." Update only `defaultMode` while preserving valid existing capability settings. If config does not exist, create the minimal shape:

```json
{
  "defaultMode": "strict-workflow"
}
```

Do not replace invalid config without resolving that source-truth conflict. Use the requested valid mode. Do not add current mode, task, phase, version, or activation-path fields.

Direct skill calls are manual state selection. If the user calls a workflow segment directly, operate in that segment while still using the decision gate for user-owned decisions.
