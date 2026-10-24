---
name: discuss-work
description: "Use whenever what to do, or how, is not settled yet: exploring a problem, comparing options or approaches, questioning assumptions, brainstorming, planning an approach, or revisiting a direction after new evidence. Read it before the first edit of any task that builds, fixes or changes behavior, to agree with the user what you will do, where you stop and which choices are theirs. Also use mid-work when a choice the user owns comes up (behavior, names, defaults, scope, cost, risk) or sources conflict; when a question needs a quick experiment before building on it; when a discussion or its decisions must outlast the conversation; and when the user asks to skip or lighten optional steps such as a plan, a review or a record."
---

# Discuss Work

Work out with the user what to do, and how, while that is still open; agree the work and every choice that is the user's before building; keep those choices in one decision list through the work; and account for them at the end.

A **user-owned choice** changes something the user will see or live with: behavior, names, text or public interfaces the user meets, defaults, what happens on error, data written or lost, scope, compatibility or migration, permissions, security, privacy, cost, or other risk. Mechanics that change none of these are yours to choose. The [Interaction Contract](../../runtime/prompts/interaction-contract.md) governs what the user's turn asks for.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Routes

| Situation | Go to |
| --- | --- |
| What to do, or how, is still open | Explore, below |
| A task that builds or changes behavior, before the first edit | Agree Before Building, below |
| A user-owned choice or conflicting sources mid-work | Choices During The Work, below |
| Writing or checking the decision list, or the agreement, handover or catch-up built from it | Run [choices](scripts/choices.mjs), as Build The Decision List says |
| A question existing evidence cannot settle but running something could | [learning action](references/learning-action.md) |
| Discussion state, an emerging route or its Checkpoints must outlast the conversation | [discussion continuity](references/discussion-continuity.md) |
| Representation, interfaces, ownership, state or failure behavior could materially change a technical recommendation | Execute Work's [design](../execute-work/references/design.md) |
| A reported or recurring failure needs a cause rather than options | Execute Work's [diagnose](../execute-work/references/diagnose.md) |
| Agreed, concrete work | [Execute Work](../execute-work/SKILL.md) |

## Rules

- Conversation, convergence, a recommendation or a recorded proposal never authorizes building. On a task that builds or changes behavior, send the agreement before the first edit and wait for the user's answer, unless a case in "When To Skip" applies.
- Leave priorities, behavior, constraints and tradeoffs the user owns to the user. After asking, stop: do not perform the blocked action until the user answers, and never settle a user-owned choice by proceeding.
- Never ask the user to choose between factual claims that evidence can settle; look them up.
- An answer decides only what it answers. A question, criticism, hypothesis, condition, or request for more information is not a decision: respond to it and keep waiting. Urgency, prior effort, or general approval to continue settles no choice that was not named.
- Keep supported facts and the user's decisions apart from hypotheses, proposals and open choices. Your recommendation or default never becomes a requirement or a Decision because it is repeated, recorded or built; record as a Decision only what the user accepted.
- Every user-owned choice the work makes goes in the decision list, whether or not anyone answered it. A technical choice that changes something the user will see goes in the plain list.
- Never weaken required behavior to make an approach look simpler.

## Explore

Goal: enough shared understanding to choose the next sound action, at the depth the user asked for.

Respond to the substance before steering the process. A request to discuss keeps the user involved: gather what the question needs, say what it implies, and come back at the next meaningful question or supported conclusion. A direct request that settles the outcome and leaves the approach to you needs no discussion when existing evidence can resolve the remaining facts and reversible local choices.

Name which understanding is missing, and establish only that: **what** (the problem, desired result, accepted behavior, constraints, non-goals, what counts as success) or **how** (mechanism, dependencies, affected boundaries, tradeoffs, the evidence needed in the actual environment). When reopening, name what changed and keep what still holds; a new local obstacle does not reopen the whole task.

Before inspecting, name the missing fact and how its answer could change the discussion, and check whether current evidence already answers it. Read the focused source, caller, contract or observation that answers it, not a survey, and read more only when the result leaves a material question open; inspect code, tests, docs, supplied material and current primary sources for external versions or interfaces rather than asking the user for facts you can find. Source inspection cannot establish unobserved runtime behavior. Stop when the evidence supports the next decision; do not collect every later dependency or plan the exact implementation while the outcome is still open.

Carry your share of the thinking: say what the evidence and intent imply, challenge unsupported claims and consequential assumptions, compare only materially different paths that could realistically be chosen with what each sacrifices and assumes, recommend the best-supported one and what would change it, and revise when evidence changes. Keep one consequential uncertainty in focus; no questionnaire, no invented alternatives for ordinary choices. Before recommending a new obligation, tell a requirement from a limitation of the current approach, and give its consequence in the user's terms ("requires changing and distributing a patched host," not "needs a provenance interface"), with a simpler in-scope alternative when one is supported.

When the likely work is clear, propose coherent outcomes and their dependencies, near-term work concrete and later work directional. End the discussion when the next sound action no longer depends on open direction, or a learning action, user decision, wait or stop is clear; not because more could be explored. Return what the next step needs: supported understanding, tentative approach, open questions that matter, evidence, the recommended or accepted next action, and what is still unauthorized. Stable accepted content that needs a durable source becomes a Spec, and an ordered strategy that must outlast the conversation a Plan, through [Write Docs](../write-docs/SKILL.md); neither is mandatory. When the user asks to build, agree it below; when they leave the rest of the investigation and implementation to you, do not make them finish planning it or gather again what the discussion found.

## Agree Before Building

### Build The Decision List

Goal: before editing, every place where the request, the repository and the developer docs leave a user-owned choice open is written down with your default.

Read the request in the Working Method's layers and find what the change touches; each open choice becomes one item, and what those sources settle is not listed. Write technical items too (names, files, data structures, the code you will copy, exact messages): listing them is how you notice choices you would otherwise make unseen.

Each item has:

- an ID: `P1`, `P2`… for plain items the user sees, `T1`, `T2`… for technical ones;
- the choice, for a plain item phrased as what the user will see or live with ("When several jobs pile up, should the oldest run first or the newest?", not "Queue or stack?");
- your default and why: what matches existing behavior and is easiest to reverse, citing where;
- for a technical item, the plain item it serves (`T3 -> P1`);
- its state: `proposed`, `agreed` (the user answered; quote them), `default` (no one answered), `changed` (with why), `new` (found after the agreement; the user has not seen it), or `dropped`.

Write one line per item, plain items first:

```markdown
- P1 [agreed] When jobs pile up, which runs first? -> oldest first (the scheduler does, src/sched.ts:40). You: "go" (2026-10-20). Shows at: src/queue.ts:12
- P2 [new] Text when the queue is full -> "Queue full, try later". Shows at: src/queue.ts:30
- T1 [default] FIFO array in queue.ts -> serves P1
```

Check the list with [choices](scripts/choices.mjs): `node <discuss-work-directory>/scripts/choices.mjs validate --list <file|->`, or `--record <record.md>` for the task's `sources/decisions.md`. It refuses a bad ID, state or `T -> P` link, or a plain item without a default.

### Send The Agreement

Goal: the user can agree in one word or correct one line.

Send one reply, not a dialog, before the first edit:

```text
What I'll do:   <the outcome>
Where I stop:   <done when; what I won't touch>
Your decisions: 1. <a choice the request leaves open, as the user meets it>. I'd go with <default>, because <reason>.
                2. ...
Technical:      <N> more choices; say "show technical" to see them.
```

`choices.mjs agreement --do <outcome> --stop <where you stop>` renders this reply from the list. Show the technical list in full when the user asks or has said they always want it, and leave the line out when they have said never. With no plain items, say so and still wait.

`Where I stop` names the endpoint the user can hold you to, and where you come back. After discussing several possible Slices, an ambiguous "proceed" needs it settled: the next Slice and return, or the whole task? Do not ask when the user already named the endpoint.

"Go", "fine", "your call" and "just do it" accept every default: those items become `agreed`. A correction changes only the item it names. Then build within the agreement, through to where you stop.

### When To Skip

Goal: stop wherever an unseen choice could change the result, and nowhere else.

- A question, discussion or review that changes nothing needs no agreement.
- A change the user specified exactly ("change `state=draft` to `state=final` in target.txt"), or a run where no one can answer (a routed worker, an unattended run), counts as the agreement: take your defaults for anything it leaves open (state `default`) and put the whole list in your final report.

A request that looks clear is not a skip: the choices it leaves open are the ones you have not noticed yet.

When the user explicitly asks to skip an optional step, such as waiting for this agreement, a plan, a review or a record, skip only what they named, for as long as they said. It changes no authority, no checkpoint they selected, and no claim: a check they decline leaves its claim unverified. Without the wait, take your defaults (state `default`), still ask one question before a hard-to-reverse choice, and put the whole list in your final report. When a standing skip must survive context loss and a Working Record exists, record it in the Work agreement through Track Work.

### Keep The List

Goal: after an interruption or compaction, the next context knows what the user decided and what you only assumed.

Without a Working Record, the list lives in the conversation; never create a record only to hold it. With one, [Track Work](../track-work/SKILL.md) says where the agreement, the user's answers and the list live.

Under [Cognitive Routing](../../capabilities/cognitive-routing/SKILL.md), only Coordinator keeps the list and asks the user; a worker returns the choices it made.

## Choices During The Work

Goal: no choice is made silently, and the user is interrupted only when the work cannot go on without them.

- A new choice that blocks the next step: settle its facts first, then ask one question (Ask One Question) and wait.
- A new choice that does not block: take your default, add it as `new`, and continue.
- A default that proves wrong: mark it `changed` with why; if it changes an `agreed` item, that needs the user's yes.
- Several at once: ask the earliest one whose answer decides whether the others matter. Mid-work questions come one at a time; the agreement is the only list you send.
- Work that turns out larger with the same outcome stays covered: continue without asking.
- A remedy that makes a user-owned choice needs a new yes: explain its concrete consequence and the realistic alternatives, then ask.
- New evidence that reopens the direction itself, not one bounded choice: go back to Explore for what changed.

When sources the work relies on disagree, state each one's exact claim, scope and status (current, accepted, draft, historical, generated) and apply the repository's own precedence; code is not right because it runs, and tests are not requirements because they fail. Ask only when precedence does not settle it and the answer changes the result.

## Ask One Question

Goal: the user decides from one look, knows what you recommend, and their answer settles exactly what you asked.

When the host has a question tool (`ask_user` on Pi with Freeflow, `AskUserQuestion` on Claude Code), a bounded choice of two to four real options usually goes in its dialog, with what you found and why it matters in your reply. Ask in your reply when the choice needs more explanation, or no dialog can be shown.

- The question is one full sentence about the outcome the user owns ("Ship Task Memory on or off by default?"), not the mechanics ("Which value for `taskMemory.enabled`?").
- Give two to four real options, each a few words with what choosing it does and costs; leave out dominated, unsafe, unavailable and hypothetical ones, and never add "Other".
- Put your recommendation first, its label ending in "(Recommended)", when evidence supports one.
- If the user closes the dialog, ask in your reply and do not act on the choice meanwhile.

Record the question and the user's answer in their words.

## Account At The End

Goal: before you claim done, the user sees every choice they have not seen.

The decision check runs in [Review Work](../review-work/SKILL.md)'s self-review of work, against this list. Find the choices the work made that the agreement did not settle, reading the change for anything the user would see: names, messages, defaults, behavior on error or in cases nobody specified, data written, and conventions copied from nearby code. Bring each `agreed` item with where the user agreed it (the work agreement, a Decision such as `D-003`, or their message) and the `file:line`, test or output that shows it was done as agreed, and each `changed` item with its reason; add each choice the diff shows that no item covers as `new`. Choices for the user stay in this list, never in a Decision, which holds only what the user accepted; building a choice does not settle it. The hand-over (the pull request through [Deliver Work](../deliver-work/SKILL.md), or the final report) shows what done looks like against what was done, and only the `new`, `changed` and `default` items. Agreed items stay out. `choices.mjs handover` lists those items; after an unattended run, `choices.mjs catch-up --record <record.md>` lists the defaults taken, the choices waiting and what ran.
