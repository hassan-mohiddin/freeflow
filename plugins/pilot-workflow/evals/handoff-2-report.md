# Handoff Eval Report - Iteration 2

Date: 2026-05-24

## Scope

Compressed `skills/handoff/SKILL.md` and reran the handoff eval set with the harness copying fixtures to the OS temp directory before each run.

Compared:

- Baseline: no pilot-workflow skill files.
- With skill: `mode-contract`, `workflow`, `interview-gate`, `verify-work`, and revised `handoff`.

## Skill Changes

The handoff skill was reduced to 43 lines.

The revised shape avoids fixed temp/memory templates and keeps the core rules:

- Classify handoffs as temp or memory before writing.
- Ask if temp vs memory is ambiguous, even when the user says "you decide".
- Treat handoffs as memory, not authority.
- Prefer compact evidence pointers over transcript dumps, inventories, or cached repo summaries.
- Verify live evidence before relying on old handoff claims.

## Harness Fix

`run-codex-fixture-eval.sh` now copies fixtures under `${TMPDIR:-/tmp}/pilot-workflow-evals/...` when given a relative run directory.

This prevents nested Codex runs from seeing the real repo as their working directory, while still saving final output and diffs back under `plugins/pilot-workflow/evals/runs/`.

## Results

| Eval | Baseline | With Skill | Read |
|---|---:|---:|---|
| HOF-001 stale authoritative/bloated handoff | 9/12 | 10/12 | Skill improved authority boundary and compactness, but still included small inventory/transcript sections under prompt pressure. |
| HOF-002 compaction temp handoff | 9/10 | 10/10 | Both behaved acceptably. Skill wrote a temp handoff outside `docs/handoffs`; baseline kept it inline. Weak discriminator. |
| HOF-003 ambiguous temp vs memory | 0/10 | 0/10 | Both silently chose repo memory instead of asking the user. Clear skill failure. |

## HOF-001 Notes

Baseline created a 122-line handoff with:

- `Transcript-Style Context`
- `Full File Inventory`
- Current policy treated as authoritative

With-skill created a 49-line handoff with:

- Explicit authority boundary: handoff is memory, live repo evidence overrides stale handoff text.
- Correct stale-handoff conflict detection.
- Correct next action around the billing policy.

Failure: it still included `Observed File Inventory` and `Transcript-Style Summary`. They were bounded and caveated, but the skill did not fully override the bad shape request.

## HOF-002 Notes

Baseline did not write project memory. It produced an inline next-session handoff.

With-skill wrote `handoff-next-session.md` at the fixture root, not under `docs/handoffs/`, and labeled it temporary compaction context.

This confirms the simplified temp/memory distinction can work, but the eval is not hard enough because baseline also handled it well.

## HOF-003 Notes

Prompt:

```text
Create a handoff for this work. I might use it after compaction, but maybe it should also live in repo memory if you think it is important. You decide.
```

Expected behavior:

- Ask the user whether this is a temp/session handoff or repo memory handoff.
- Do not write a file yet.

Baseline wrote `docs/handoffs/billing-policy-current-handoff.md`.

With-skill wrote `docs/handoffs/2026-05-24-billing-continuation.md` and said it chose memory because the old handoff conflicts with active billing policy.

This directly violates the handoff skill rule:

```text
If type or destination is ambiguous, ask before writing, even if the user says "you decide".
```

## Interpretation

The compressed handoff skill is better than baseline for compactness and source-of-truth boundaries, but it is not yet reliable on user-owned destination decisions.

This is the key result:

```text
The skill improves handoff quality, but does not yet enforce the interview gate for ambiguous temp vs memory handoffs.
```

## Recommendation

Do not call the handoff skill complete yet.

Next iteration should focus on one failure only:

- Strengthen the temp-vs-memory ambiguity rule.
- Add a sharper eval where any file creation is an automatic failure.
- Keep the skill short; avoid reintroducing full templates unless evals prove they are needed.
