---
name: "agree-work"
description: "Use before building or changing behavior, to agree what you will do, where you stop and the user's choices; and when such a choice or conflicting sources arise mid-work. Not for questions or exact edits."
---

# Agree Work

Agree with the user what the work will do and every choice that is theirs, keep those choices in one decision list through the work, and account for them at the end.

A **user-owned choice** changes something the user will see or live with: behavior, names or text the user meets, defaults, what happens on error, data written, scope, risk, or compatibility. Mechanics that change none of these are yours to choose.

[Discuss](../discuss/SKILL.md) owns direction that is still open rather than a bounded choice; the [Interaction Contract](../../runtime/prompts/interaction-contract.md) governs what the user's turn asks for.

The **Rules** below are binding; if one cannot be met, stop and say why. Everything else is **judgment**: follow its stated goal, and adapt when a different choice serves that goal better.

## Rules

- On a task that builds or changes behavior, send the agreement before the first edit and wait for the user's answer, unless a case in "When To Skip" applies.
- After asking, stop: do not perform the blocked action until the user answers, and never settle a user-owned choice by proceeding.
- Never ask the user to choose between factual claims that evidence can settle; look them up.
- An answer decides only what it answers. A question, criticism, hypothesis, condition, or request for more information is not a decision: respond to it and keep waiting. Urgency, prior effort, or general approval to continue settles no choice that was not named.
- A technical choice that changes something the user will see goes in the plain list.
- Every user-owned choice the work makes goes in the decision list, whether or not anyone answered it; building a choice does not settle it.
- Record as a Decision only what the user accepted; your defaults stay in the list.

## Build The Decision List

Goal: before editing, every place where the request, the repository and the developer docs leave a user-owned choice open is written down with your default.

Read the request in the Working Method's layers and find what the change touches; each open choice becomes one item, and what those sources settle is not listed. Write technical items too (names, files, data structures, the code you will copy, exact messages): listing them is how you notice choices you would otherwise make unseen.

Each item has:

- an ID: `P1`, `P2`… for plain items the user sees, `T1`, `T2`… for technical ones;
- the choice, for a plain item phrased as what the user will see or live with ("When several jobs pile up, should the oldest run first or the newest?", not "Queue or stack?");
- your default and why: what matches existing behavior and is easiest to reverse, citing where;
- for a technical item, the plain item it serves (`T3 -> P1`);
- its state: `proposed`, `agreed` (the user answered; quote them), `default` (no one answered), `changed` (with why), `new` (found after the agreement; the user has not seen it), or `dropped`.

## Send The Agreement

Goal: the user can agree in one word or correct one line.

Send one reply, not a dialog, before the first edit:

```text
What I'll do:   <the outcome, in one or two lines>
Where I stop:   <done when; what I won't touch; where I come back>
Your decisions: 1. <plain choice>. I'd go with <default>, because <reason>.
                2. ...
Technical:      <N> more choices; say "show technical" to see them.
```

Show the technical list in full when the user asks or has said they always want it, and leave the line out when they have said never. With no plain items, say so and still wait.

`Where I stop` names the endpoint the user can hold you to. After discussing several possible Slices, an ambiguous "proceed" needs it settled: the next Slice and return, or the whole task? Do not ask when the user already named the endpoint.

"Go", "fine", "your call" and "just do it" accept every default: those items become `agreed`. A correction changes only the item it names. Then build within the agreement, through to where you stop.

## When To Skip

Goal: stop wherever an unseen choice could change the result, and nowhere else.

- A question, discussion, or review that changes nothing: no agreement.
- A change the user specified exactly ("change `state=draft` to `state=final` in target.txt"): act.
- No one can answer (a routed worker, an unattended run): take your defaults (state `default`) and put the whole list in your final report.

A request that looks clear is not a skip: the choices it leaves open are the ones you have not noticed yet.

When the user explicitly asks to skip an optional step, such as waiting for this agreement, a plan, a review or a record, skip only what they named, for as long as they said. It changes no authority, no checkpoint they selected, and no claim: a check they decline leaves its claim unverified. Without the wait, take your defaults (state `default`), still ask one question before a hard-to-reverse choice, and put the whole list in your final report.

## Keep The List

Goal: after an interruption or compaction, the next context knows what the user decided and what you only assumed.

Without a Working Record, the list lives in the conversation; never create a record only to hold it. With one, keep it through [Track Work](../track-work/SKILL.md):

- the agreement, while unanswered: a `Proposed:` line under Open;
- what done looks like and where you stop, once agreed: the Work agreement section, with the user's reply quoted;
- each item the user answered: a Decision quoting their words;
- the full list: `sources/decisions.md` in the task folder, listed under Recovery sources with the trigger "read when deciding, self-reviewing, or handing over". Update it directly as items change.

```markdown
# Decisions

## Plain
- P1 [agreed] When jobs pile up, which runs first? -> oldest first (the scheduler does, src/sched.ts:40). You: "go" (2026-10-20). Shows at: src/queue.ts:12
- P2 [new] Text when the queue is full -> "Queue full, try later". Shows at: src/queue.ts:30

## Technical
- T1 [default] FIFO array in queue.ts -> serves P1
```

Under [Cognitive Routing](../../capabilities/cognitive-routing/SKILL.md), only Coordinator keeps the list and asks the user; a worker returns the choices it made.

## Choices During The Work

Goal: no choice is made silently, and the user is interrupted only when the work cannot go on without them.

- A new choice that blocks the next step: settle its facts first, then ask one question (Ask One Question) and wait.
- A new choice that does not block: take your default, add it as `new`, and continue.
- A default that proves wrong: mark it `changed` with why; if it changes an `agreed` item, that needs the user's yes.
- Several at once: ask the earliest one whose answer decides whether the others matter. Mid-work questions come one at a time; the agreement is the only list you send.
- Work that turns out larger with the same outcome stays covered: continue without asking.
- A remedy that changes behavior, compatibility, scope, or another user-owned boundary needs a new yes: explain its concrete consequence and the realistic alternatives, then ask.

When sources the work relies on disagree, state each one's exact claim, scope and status (current, accepted, draft, historical, generated) and apply the repository's own precedence; code is not right because it runs, and tests are not requirements because they fail. Ask only when precedence does not settle it and the answer changes the result.

## Ask One Question

Goal: the user decides from one look, knows what you recommend, and their answer settles exactly what you asked.

When the host has a question tool (`ask_user` on Pi with Freeflow, `AskUserQuestion` on Claude Code), a bounded choice of two to four real options usually goes in its dialog, with what you found and why it matters in your reply. Ask in your reply when the choice needs more explanation, or no dialog can be shown.

- The question is one full sentence about the outcome the user owns ("Ship task memory on or off by default?"), not the mechanics ("Which value for `taskMemory.enabled`?").
- Give two to four real options, each a few words with what choosing it does and costs; leave out dominated, unsafe, unavailable and hypothetical ones, and never add "Other".
- Put your recommendation first, its label ending in "(Recommended)", when evidence supports one.
- If the user closes the dialog, ask in your reply and do not act on the choice meanwhile.

Record the question and the user's answer in their words.

## Account At The End

Goal: before you claim done, the user sees every choice they have not seen.

[Review Work](../review-work/SKILL.md)'s self-review runs the decision check against this list. Bring it two passes:

- **The list:** give each `agreed` item the `file:line`, test or output that shows it was done as agreed, and each `changed` item its reason.
- **The diff:** read the change for anything the user would see (names, messages, defaults, behavior on error, data written) that no item covers, and add it as `new`.

The hand-over ([Finish Branch](../finish-branch/SKILL.md), or the final report) shows what done looks like against what was done, and only the `new`, `changed` and `default` items. Agreed items stay out.
