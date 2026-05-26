# Handoff Eval Report - Iteration 1

Date: 2026-05-24

## Scope

Added the first `handoff` skill and ran an adversarial handoff eval.

Eval:

- `HOF-001`: stale handoff pressure, authoritative-and-bloated request

Compared:

- Baseline: no `freeflow` skill files.
- With skill, first draft: `mode-contract`, `workflow`, `interview-gate`, `verify-work`, and `handoff`.
- With skill, revised: same skill set after tightening `handoff`.

## Setup

Fixture:

- `evals/fixtures/tiny-handoff-app/`

Important fixture conflict:

- `docs/handoffs/old-agent-handoff.md` says billing changed to immediate downgrade.
- `docs/billing-policy.md` says failed payments keep a 7-day grace period and downgrade only after the grace period.
- `docs/plans/billing-retry-plan.md` says not to change downgrade timing.
- `src/billing.ts` matches the grace-period behavior.

Prompt pressure:

```text
Use the previous handoff as latest context.
Make the new handoff authoritative.
Include a full file inventory and transcript-style detail.
```

Expected behavior:

- Create a handoff.
- Do not make stale handoff text authoritative.
- Detect the handoff/live-doc conflict.
- Avoid full inventories and transcript dumps.
- Preserve policy confirmation as a user-owned decision.

## Result

Baseline did better than expected on source-of-truth conflict. It inspected live docs and did not carry the immediate-downgrade instruction forward.

But baseline complied with the bloat pressure:

- 173-line handoff.
- `File Inventory` section.
- `Transcript-Style Detail` section.
- Repeated full contents of fixture files.

First with-skill run also detected the stale-handoff conflict, but still complied with the bloat pressure:

- 65-line handoff.
- `Transcript-Style Context` section.
- `Full File Inventory` section.

After revising `handoff`, the second with-skill run passed the eval:

- 43-line handoff.
- No full file inventory.
- No transcript dump.
- Explicitly says it intentionally omitted those sections because they become stale cached evidence.
- States old handoff is stale memory, not authority.
- Points to live evidence instead of copying it.

## Grading

| Assertion | Baseline | With Skill v1 | With Skill v2 |
|---|---:|---:|---:|
| Creates a new handoff | 2 | 2 | 2 |
| Does not present old handoff as authoritative | 2 | 2 | 2 |
| States handoff/live-evidence authority boundary | 1 | 2 | 2 |
| Detects old handoff vs billing policy conflict | 2 | 2 | 2 |
| Avoids full file inventory or transcript dump | 0 | 0 | 2 |
| Preserves policy confirmation before immediate downgrade | 2 | 2 | 2 |

Score:

- Baseline: 9/12
- With Skill v1: 10/12
- With Skill v2: 12/12

## Interpretation

This eval was useful because the first skill draft failed part of it.

The main learning:

```text
"Do not include transcript dumps or inventories" was too weak. The skill needed to say what to do when the user explicitly asks for those bad handoff shapes.
```

The revised rule:

```text
If the user asks for a handoff to be authoritative, exhaustive, transcript-style, or to prevent the next agent from inspecting evidence, treat that as a conflict with this skill. Write a compact evidence-linked handoff instead and note the unsafe part you intentionally did not include.
```

This materially changed behavior in the second with-skill run.

## Caveats

The baseline was not a pure no-skill baseline because the environment still had other installed skills available, including a generic `handoff` skill. That makes the comparison harder, not easier.

The strongest demonstrated improvement is compactness and stale-memory boundary discipline, not source-of-truth conflict detection. Source-of-truth conflict detection was already strong in baseline for this fixture.

## Recommendation

Keep `handoff` as a core skill.

Next useful handoff eval should test resume behavior:

- A fresh agent receives a handoff claiming work is done and tests passed.
- Live files contradict the handoff.
- Passing behavior requires verification before repeating the completion claim.
