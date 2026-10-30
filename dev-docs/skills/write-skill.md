# Write Skill

> **Covers:** `skills/write-skill/`
> **Tests:** `.skill-eval/write-skill/`, `.skill-eval/gate/write-skill/`
> **Verified at:** `70afe225` (2026-10-30)

For anyone changing Write Skill: what it is meant to change, why it is shaped the way it is, and what the evidence shows. The method itself is in [the skill](../../skills/write-skill/SKILL.md); this record holds the reasons it does not.

## Purpose

Write Skill is read before an agent creates or revises any text another agent acts on: a skill, `AGENTS.md`, a runtime prompt, a tool description, a subagent brief or a judge prompt. It exists because such text is a prompt intervention, not a document: it changes behavior only when it is in context at the decision it targets, and prose that reads well can still reach no decision at all.

## Behavioral Claim

- **Behavior it produces:** instruction text placed on the lowest rung that reaches the agent in time; packages shaped as trunks (one capability whose body routes to its references and scripts); scripts and structured output where prose would be followed by hand; binding Rules kept apart from judgment; revisions measured against fixed cases; each skill's reasons kept in its design record.
- **Failure it prevents:** skills written as documents; methods in bodies the agent never opens; many narrow skills whose descriptions compete; instructions that only grow; author debate and evaluation status left in the executing text.
- **Earliest decision:** before the first edit to any instruction text. `runtime/prompts/core.md` names it at that step ("Write Skill before creating or revising any text an agent acts on"), and `AGENTS.md` repeats it for this repository.
- **Cues before the body is read:** its description, which names merging, splitting, placement and skills read at the wrong time, and core's step.
- **Guaranteed context:** the description on every host; core where Freeflow's runtime prompts are on.
- **Nearby cases it leaves alone:** documents for people (Write Docs), and judging whether a finished skill is fit to use (Review Work).
- **When it stops steering:** once the text is written, checked and, where the claim needs it, evaluated.

## Design

- **Trunks, not many skills.** Guidance changes a decision only when every link holds: the description gets the skill read, the routing table gets the right reference or script read when its situation arises, and the agent applies it. The links multiply, so each skill boundary between a request and the method lowers the chance it reaches the decision. Inside a trunk, routing is chosen from a table with the body in context; between skills, from one description among all the others. ADR 0014 made this Freeflow's structure (twenty-five skills to eleven); the reasoning moved into the skill's "Choose Skill Boundaries" so later skills follow it.
- **Descriptions for recall.** A trunk's description names the situations each reference and script serves, up to the host's 1,024-character limit, and adds a "not for" exclusion only where reading the skill would do harm (commit `d3694df`). A read the body exits safely costs little; a missed read costs the decision.
- **A light body.** A trunk's body is paid on every activation, so it holds the routing table, the common route and the Rules; the rest moves to references and scripts. Every reference a situation needs has its own row in the body, so reaching it never depends on reading another reference first.
- **Capability over prose.** A script's output is in front of the agent whether or not anything was read; prose is in context only when the body is.
- **Design records outside the package.** The executing text holds only what the agent acts on; the claim, evidence, rejected alternatives and dropped candidates live here, in Write Docs' skill design record shape.

## Evidence

| What | Result | Where | Limits |
| --- | --- | --- | --- |
| Skill bodies are rarely read | In 30 of Freeflow's evaluation runs, 3 read any skill file | Stated in the skill's "Prefer A Capability To Prose" | The source runs are not linked from here |
| Always-loaded text reaches the agent; bodies mostly do not | The Workflow and Action Selection bodies were almost never opened; information at the decision point moved results | [ADR 0014](../adr/0014-capability-skills-and-a-compact-core.md), Context | Observational, from Freeflow's own runs |
| Broad descriptions and one-layer prompts raise reads | On Haiku, 90 cases: skills opened when they should be in 83% of cases with PR #84's one-layer prompts, against 57% for the old base and 43% for main at the time; an earlier trigger run gave 57% vs 43% vs 46% | Outside the repository: the project's shared files `review-eval-verify/RESULTS-one-layer-arm.md` and `freeflow-handoff/STATUS.md`; raw runs under `.skill-eval/runs/` in the `freeflow-verification` worktree | Recall only; the near-miss (false-positive) rate is not recorded here. One model |
| Why Haiku still skipped skills | An analysis of the 32 misses in the broad-descriptions run | Outside the repository: `review-eval-verify/ANALYSIS-broad-descriptions.md` | Not summarized here |
| Write Skill's own regressions | The gate suite: revising for a tool, keeping a placement fix, classifying Rules and judgment, a justified guard, and three placement cases | `.skill-eval/gate/write-skill/` | No case covers trunk structure or design records; not run for the 2026-10-27 revision |
| Package checks | `skill-author` validate, compare, similarity and inspect | `.skill-eval/write-skill/tests/` | Structure, not behavior |

- **Try a skill on a real task before measuring it.** Evaluate In One Loop starts with Evaluate Behavior's trial: one agent uses the skill on work it serves while keeping a friction log, and Review Work adjudicates each item before it becomes a change. In the Research Work build, three trials (a code report, a literature review, a systematic review) logged about thirty friction items that became most of PRs #113 and #114; some items were the trial agent's own mistake, which is why a log is adjudicated like a review, not acted on. The trial stays apart from measurement because asking a subject for notes changes what it does. The trial's agent is started and run as Execute Work's delegation reference says.

## Rejected

- **Many narrow skills, one per job type.** Their descriptions competed, and their bodies were rarely opened (ADR 0014).
- **A Workflow skill that routes to the others.** Its body was almost never read; the cycle moved to core (ADR 0014).
- **Every method in the always-loaded prompt.** Paid on every request; only guidance shown to change behavior goes there (ADR 0014).
- **"Not for" exclusions by default.** They cost recall to prevent reads that are harmless (commit `d3694df`).
- **A strict one-level limit on references.** Existing references point to siblings for neighbouring situations; the rule is that the body routes to every reference, not that references never link.

## Dropped

None recorded before this record was started.

## Open Questions

- The near-miss rate under broad descriptions: reported as near zero, not yet recorded with its source.
- Whether the gate needs cases for the trunk guidance and for keeping a design record. Neither is measured.
- Whether delivery, steerability and causal share combine as a product when a skill changes success. It is a hypothesis from the Beyond the Weights research (`research/agent-success/theory-of-agent-success.md` in that repository), untested.
