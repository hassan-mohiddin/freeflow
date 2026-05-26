# Execute Plan Or Decision Gate Handoff

Date: 2026-05-25

## Purpose

After compaction, continue Freeflow development.

The next session should choose one path before editing:

1. Start `execute-plan`.
2. Fix the ambiguous decision-point failure in `interview-gate` and possibly `handoff`.

Do not assume the path silently.

## Read First

- `AGENTS.md`
- `CONTEXT.md`
- `docs/adr/`
- `docs/research/freeflow-artifact-skills.md`
- `plugins/freeflow/skills/write-spec/SKILL.md`
- `plugins/freeflow/skills/review-artifact/SKILL.md`
- `plugins/freeflow/skills/write-plan/SKILL.md`
- `plugins/freeflow/evals/write-plan-1-report.md`
- `plugins/freeflow/evals/write-plan-2-report.md`

This handoff is memory, not authority. Inspect live files before editing.

## Current State

Added and eval-tested artifact skills:

- `write-spec`
- `review-artifact`
- `write-plan`

`write-plan` now covers:

- Approved spec: write the plan.
- Clear low-risk context: write a lightweight plan.
- Hidden owner decision: stop and ask.
- Bug without repro or feedback loop: stop and ask/propose the feedback loop.

Latest `write-plan` eval:

- `WPL-004` bug plan without repro.
- Baseline: `2/10`.
- First with-skill failed by writing a guessed stale-dashboard fix plan.
- Final with-skill: `10/10`.
- Final with-skill diff: `0` bytes.

Report:

- `plugins/freeflow/evals/write-plan-2-report.md`

## New Issue To Preserve

Before this handoff, the user asked to compact before starting `execute-plan`.

The assistant immediately started creating a temp handoff because Matt's handoff skill says to save handoffs to the OS temp directory. That was a silent decision.

Why it was wrong:

- The user did not explicitly ask for temp handoff.
- This repo has recently stored handoffs in `docs/handoffs/`.
- Temp handoff vs memory handoff is a material durability choice.
- The request was not exactly a question, but it was an ambiguous decision point.

Lesson:

```text
Fire the interview gate at ambiguous decision points, not only direct questions.
```

Candidate rule:

```text
If the user request implies action but leaves multiple materially different paths open, stop and ask before acting.
```

Material differences include:

- Temp artifact vs durable artifact.
- Repo edit vs no repo edit.
- Artifact creation vs chat answer.
- Source-truth change vs implementation-only change.
- Diagnostic plan vs fix plan.

Candidate `handoff` rule:

```text
Before writing a handoff, classify destination:

- Temp handoff: immediate compaction or next-chat continuation.
- Memory handoff: durable repo context for future sessions.

If destination is unclear, ask before writing.
```

## Next Path Options

### Option A: Start `execute-plan`

Use this if momentum matters more than immediately patching the decision-gate issue.

References:

- Obra/Superpowers `executing-plans`
- Existing Freeflow skills: `write-plan`, `review-artifact`, `verify-work`
- Matt style: concise, failure-focused, no long manuals

Expected first work:

- Read Obra `executing-plans`.
- Read current Freeflow `workflow`, `verify-work`, `review-work`, and `write-plan`.
- Draft `plugins/freeflow/skills/execute-plan/SKILL.md`.
- Add focused evals for:
  - Execute from valid plan.
  - Stop on plan/source conflict.
  - Stop when plan has hidden owner decision or missing verification.

### Option B: Fix Decision-Point Ambiguity First

Use this if the latest failure should be encoded before more workflow skills.

Likely target skills:

- `plugins/freeflow/skills/interview-gate/SKILL.md`
- Possibly `plugins/freeflow/skills/handoff/SKILL.md`

Expected first eval:

- Prompt implies compaction/handoff but destination is ambiguous.
- Baseline or old skill silently writes a temp or memory handoff.
- Fixed skill asks temp vs memory before writing.

Important: keep wording concise. Do not add a long manual.

## Dirty / Untracked Work To Preserve

Expected dirty state includes:

- Modified `plugins/freeflow/evals/fixture-evals.json`
- Untracked artifact skill docs/reports/prompts/fixtures:
  - `docs/research/freeflow-artifact-skills.md`
  - `docs/handoffs/2026-05-25-artifact-skills-handoff.md`
  - `docs/handoffs/2026-05-25-write-plan-next.md`
  - `docs/handoffs/2026-05-25-execute-plan-or-decision-gate.md`
  - `plugins/freeflow/skills/write-spec/`
  - `plugins/freeflow/skills/review-artifact/`
  - `plugins/freeflow/skills/write-plan/`
  - `plugins/freeflow/evals/fixtures/tiny-artifact-review-app/`
  - `plugins/freeflow/evals/fixtures/tiny-plan-app/`
  - `plugins/freeflow/evals/prompts/wsp-*.txt`
  - `plugins/freeflow/evals/prompts/rar-*.txt`
  - `plugins/freeflow/evals/prompts/wpl-*.txt`
  - `plugins/freeflow/evals/write-spec-*-report.md`
  - `plugins/freeflow/evals/review-artifact-*-report.md`
  - `plugins/freeflow/evals/write-plan-*-report.md`

Do not clean or delete these unless the user asks.

## Suggested Skills

- Matt `write-a-skill` for concise skill shape.
- Matt `handoff` only as reference; repo instruction may override destination.
- Obra/Superpowers `executing-plans` for lifecycle reference if choosing Option A.
- Anthropic `skill-creator` for baseline vs with-skill eval method.

## First Message After Compaction

Suggested user prompt:

```text
Read AGENTS.md, CONTEXT.md, docs/adr/, and docs/handoffs/2026-05-25-execute-plan-or-decision-gate.md.

Then inspect live files before acting.

Do not edit until you summarize:
1. Current artifact-skill status.
2. The ambiguous decision-point failure.
3. The two next path options.

Then ask me whether to start execute-plan or fix decision-point ambiguity first.
```
