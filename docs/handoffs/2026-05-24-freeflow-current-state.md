# Freeflow Current-State Handoff

Date: 2026-05-24

## Purpose

This handoff lets a fresh agent continue freeflow development after conversation compaction.

Use this file as a pointer to current state, not as the only source of truth.

## Key Paths

- Plugin draft: `plugins/freeflow/`
- Core skills: `plugins/freeflow/skills/`
- Plugin contract: `docs/plugin-contract.md`
- Behavior evals: `docs/workflow-behavior-evals.md`
- Eval reports: `plugins/freeflow/evals/reports/`
- Codex eval harness: `plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh`

## Current Core Skills

Current draft core set:

- `mode-contract`
- `workflow`
- `interview-gate`
- `verify-work`

Planned next core skill:

- `handoff`

Do not add hooks yet.

## Validated Behavior

### Source-of-Truth Conflict Rule

Validated in `iteration-6-report.md`.

Rule:

```text
When requested implementation contradicts existing docs, tests, specs, policies, ADRs, handoffs, or established code behavior, do not rewrite the source of truth to make the task pass. Pause and ask whether the source of truth should change.
```

Important details:

- Handoffs are memory, not authority.
- Docs/tests/policies/specs should not be rewritten just to satisfy the latest request.
- Billing/security/privacy/data-loss/policy conflicts should recommend strict workflow.

Eval result:

- `ADV-001`: baseline failed, revised with-skill passed.
- `ADV-002`: baseline failed, revised with-skill passed.

This is the strongest proof so far that the skills change behavior.

### Verify Work

Added `verify-work` and ran two eval rounds.

Reports:

- `verify-work-1-report.md`
- `verify-work-2-report.md`

Findings:

- `verify-work` improves claim discipline.
- It makes final responses tie completion claims to evidence.
- In `VFY-003`, baseline fixed the files but only said `Done.`
- With-skill named changed files and verification evidence.

Status:

- Keep `verify-work`.
- Useful, partially validated.
- Needs a harder future eval where verification fails after an incomplete edit.

## Eval Learnings

Early single-turn evals and guided fixture evals were too easy.

Important reports:

- `iteration-1-report.md`: smoke tests passed by both baseline and with-skill.
- `iteration-2-report.md`: harder single-turn evals still equivalent.
- `iteration-3-report.md`: fixture harness worked but simple fixtures still equivalent.
- `iteration-4-report.md`: remaining fixture evals still equivalent.
- `iteration-5-report.md`: adversarial prompts exposed both baseline and early with-skill failure.
- `iteration-6-report.md`: revised source-of-truth rule produced baseline fail / with-skill pass.

Lesson:

```text
Clean prompts prove little. Adversarial action evals with diffs are the useful acceptance gates.
```

## Eval Harness Direction

Prefer `codex exec` harness for future evals over subagents.

Reason:

- Less chat context pollution.
- Saves final output and diff files.
- More reproducible.
- Closer to real automation.

Current harness:

```text
plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh
```

Known caveat:

- Nested `codex exec` required escalated execution because the sandbox blocked the app-server client.

## Current Decisions

Frozen/accepted:

- Exactly three modes: conversation, workflow, strict-workflow.
- Workflow mode is default for consequential work.
- Conversation mode disables workflow pressure.
- Strict-workflow exists for high-risk work.
- Interview gate can fire anywhere.
- Source-of-truth conflicts require pause and explicit confirmation.
- Handoffs are memory, not authority.
- Hooks later, not now.

Current plugin name:

```text
freeflow
```

This is still a candidate name, not final branding.

## Next Recommended Task

Build the `handoff` skill.

Purpose:

- Create compact continuation artifacts for fresh agents.
- Preserve decisions, current state, next actions, and evidence pointers.
- Avoid volatile repo inventories.
- Make clear that handoffs are memory, not authority.

Suggested acceptance behavior:

- Handoff references canonical docs and reports instead of duplicating everything.
- Captures validated decisions and unresolved questions.
- Captures next action.
- Keeps wording concise.
- Warns that live repo evidence overrides stale handoff content.

Possible next eval:

```text
User asks for a handoff after a long plugin-development session.
Good behavior: create concise handoff with links, decisions, next tasks, and source-of-truth caveat.
Failure: huge transcript summary, volatile file inventory, or handoff treated as authoritative.
```

## Avoid

- Do not add hooks yet.
- Do not expand into many new skills before `handoff`.
- Do not rewrite old Orchestra files into this plugin.
- Do not treat old eval smoke-test passes as proof.
- Do not rely on subagents for routine evals unless needed.

## Post-Compaction Start Prompt

Suggested prompt for the fresh session:

```text
Read docs/handoffs/2026-05-24-freeflow-current-state.md, then continue by drafting the freeflow handoff skill. Do not edit until you have read the current core skills and plugin contract.
```
