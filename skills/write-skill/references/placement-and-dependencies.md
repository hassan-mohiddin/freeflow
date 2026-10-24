# Placement And Dependencies

This reference is judgment: adapt it to the goal. Its binding statements restate [Write Skill](../SKILL.md) Rules.

Goal: each behavior reaches the agent before the decision it affects, at the lowest cost, with one owner, on every path that leads to that decision.

## The Ladder

| Rung | The agent sees it | It costs | It holds |
| --- | --- | --- | --- |
| 0. Always-loaded instructions (system prompt, runtime prompts) | every request | every request, every session | what an ordinary turn needs before any skill could be read: authority, honesty, the rules every task keeps, the moment each skill's activity starts with the skill's name, recovery after context loss, shared terms |
| 1. Skill description | every request | one line per skill | the job and the situations that call for the skill, in the words a user would use; where a neighbor takes over when two would trigger on the same request |
| 2. Skill body | when its activity starts | only when used | the activity's normal route, Rules and judgment |
| 3. Reference | at a named step or observable branch | only when reached | depth for one step or condition |
| Point of use | at the tool call or event | per tool or event | mechanics of that tool or event: a tool's description and guideline, a script's output, a status line, a notice |

Place each behavior on the lowest rung that still reaches the agent before the decision. A higher rung keeps at most a one-line cue or guard that points down to it.

## Rung 0 Is For Ordinary Turns

Ask: **would a capable agent get this wrong on an ordinary turn, before it had any reason to load a skill?** If yes, it belongs at rung 0. If it matters only once an activity has started, it belongs in that activity's skill. Rung 0 then names the moment the activity starts and the skill to read there, in the words the skill's description uses, so the always-loaded text and the description point at the same skill.

Keep an activity's method out of rung 0. An agent that already has the method in context sees no reason to read the skill, follows the always-loaded copy, and never reaches what only the skill holds: its scripts, its references and its formats. Rung 0 keeps a rule as a one-line guard when breaking it on any turn would do harm.

Recovery after context loss stays at rung 0 as a cue: after a compaction no skill is in context, so the cue must say which skill to reload; the method itself stays in that skill.

A rung-0 instruction that appears in two always-loaded files is paid for twice on every request. Give it one owner there before anything else.

## A Description Is A Trigger

The agent decides from the description alone whether to read the body. A description that names internal terms, lists the body's steps, or omits the user's words fails at that decision, however good the body is. Write it per Write Skill's "Write The Description For Recall"; when two skills would match the same request, one short clause saying where the other takes over is worth its words.

## Repeat As A Guard, Not As A Method

A skill may restate a rung-0 rule as a one-line guard where the skill makes the affected choice: rung 0 can be missing on some paths (a host where the user switched a prompt off, a subagent). It does not restate the method around it. When rung 0 and a skill state the same rule, keep the wording compatible; two thresholds for the same behavior ("two or three", "two or more") make the agent choose between them. Do not copy complete orchestration, authority, review, or task-memory sections into every consumer.

## Send Only What Can Be Used

Instructions, skills and tools for a capability that is off are cost without use. Send them only while their capability is effective. A settings change that alters what is sent costs one prompt-cache write; that is acceptable, and repeating unused text on every request to avoid it is not.

## References

A separate file is worth its dependency cost only when it changes when content enters context, keeps one canonical owner, or isolates a real lifecycle boundary.

Dependency runs one way:

```text
guaranteed base context
-> description
-> SKILL.md
-> required or conditional resource
```

A later layer may rely on language an earlier guaranteed layer established, not the reverse. `SKILL.md` establishes the job, the normal route, necessary terms, stop and return behavior, and the observable point where each resource is read; keep those inline. Never hide the instruction needed to recognize a reference inside that reference: that is reconstruction, not disclosure.

Classify each reference by when it is read:

- **Conditional:** only when an observable branch occurs. The body teaches enough to recognize the branch before the read; "when unclear" is no condition when the reference holds the method for recognizing it. Most references should be this kind.
- **Activity-required:** before one named activity that many activations never reach, because the skill may first exit, defer, choose another route, or find the activity does not apply. When most activations perform it, inline it.
- **Entry-required:** before the skill can follow or reject its normal route. Use one only when separation has independent value: canonical reuse across packages, separate ownership or lifecycle, generated schemas or contracts, compatibility or host constraints, or independently versioned external policy. Otherwise inline it, even when `SKILL.md` becomes substantially longer.

Required means necessary: do not call a required reference recommended or optional. If skipping a reference preserves correct execution, make its concrete optional value explicit or remove it. Keep owned resources inside the package unless canonical cross-package ownership is required. Do not split a file to satisfy a line count.

Link each resource at the first choice that needs it, with its condition. Avoid:

> See references for more information.

Prefer:

> Read Test Design before designing or materially changing the behavior check.

For every extra file, ask:

1. What conditional branch, activity, shared ownership, or lifecycle requires it?
2. When can the agent recognize the read or run condition?
3. What prior language does it assume, and where is that language guaranteed?
4. What context or ownership value does separation provide, and why is inline content worse?
5. How will links, containment, and behavior be verified?

If separation changes neither loading nor ownership, inline the content or remove it.

## Scripts

A script earns its place when the skill owns a deterministic operation or can compute the facts of a decision; when doing it by hand would be error-prone, unsafe, materially wasteful, or out of context at the decision; when its interface and failure behavior can be tested; and when its output says what it checked and what it did not. Name it in the body where it is used, with the condition to run it.

## Skills That Depend On Each Other

A set of skills is a stateful, partially loaded prompt graph, not a mandatory sequence. A Markdown link declares a package dependency; it does not select the target owner or execute the linked skill. Tell the edges apart:

- **Activation:** causes a skill to be read or made effective, such as a natural prompt matching a description, an always-loaded cue naming a recovery skill, or a capability cue.
- **Owner route:** changes which activity controls the current bounded result. A plain-text return can express it without a package dependency.
- **Composition:** adds a method, lens, reviewer contract, or domain guide without changing the current owner.
- **Reference:** loads conditional or activity depth inside a package.
- **Environment interaction:** selects one observation or effect, then returns to the same owner.
- **Persistence:** earlier guidance stays in context and may affect later behavior without another read.
- **Recovery:** reintroduces required guidance after context loss through an always-loaded cue.

Give critical skills an upstream activation or recovery edge.

### Entry Paths

For each skill, list every valid way in: description activation, routes from other skills, direct user commands, capability cues, context-loss recovery, host-specific activation, and artifact or checkpoint routes. Do not optimize only for the most common path. A skill that can activate directly cannot depend on vocabulary introduced only by a skill that usually precedes it; one reached through a recovery cue cannot assume an earlier discussion or planning skill was read. Check each related skill on:

```text
direct natural activation
routed activation from the expected parent
nearby safe-read activation
retained use after another skill loads
recovery after context loss
```

A path that works only because another skill happened to be read is not valid dependency composition.

### Shared Terms

For every shared term:

1. list all consumers;
2. list every valid path to those consumers;
3. find the nearest upstream context guaranteed on all paths;
4. define the term there;
5. keep specialized detail with its owning skill.

Place shared vocabulary in always-available context only when independently activated consumers require it. Keep local terms local when other skills should route to the owner rather than implement its method. Do not duplicate full definitions to compensate for a broken activation graph.

### Cycles

Routing may be cyclic: execution goes to verification and review and back to execution. Terms and dependency order may not: they flow from guaranteed upstream context toward consumers, and a routing cycle does not justify a terminology cycle. `validate` lists link cycles among the Markdown files a skill reaches, leaving out links to any `SKILL.md`. For each one, decide which it is. References that route between methods can stay, though the routing usually belongs in the body's routing table. References that each need the other's terms, or that are read together, should merge, or give the shared part one owner both point to.

### Consistency

Across all changed skills, inspect:

- duplicate canonical definitions, and divergent wording for the same invariant;
- early commands contradicted by later caveats;
- two skills claiming the same current ownership, or a method or lens becoming an owner by accident;
- links with no activation, route, composition, or reference job;
- terms used before a guaranteed definition;
- a read condition stated differently at two links to the same resource;
- stale recovery cues, and direct routes that bypass required context;
- retained instructions hijacking later owners.

Distinguish semantic duplication from an intentional local guard (Write Skill's Repeat Instructions Deliberately).

### What Checks Establish

`validate` and `inspect` establish links, containment, link cycles, resource inventory, and, with a routing map, routing-map parity; `similarity` finds copied text. None of them establishes correct activation, safe retained influence, semantic consistency, useful repetition, behavior preservation, or readiness. Evaluate the exact graph claim: activation, first-read body behavior, dependency composition, retained use, recovery, or artifact outcome. A small edit to one skill needs no graph artifact; use this section when several skills, paths, terms, or owners change together.

## Check A Move

- **Moving guidance down a rung** (from always-loaded to on demand) risks the agent never reading it: compare before and after with the same fixed scenarios on the models in use, aimed at the behavior that moved.
- **Removing a duplicate** whose owner stays at the same or a higher rung: review against Write Skill, plus one smoke check.
- **Rewriting a description:** a trigger check per description, one natural request that should read the skill and one near miss that should not.
- **Measuring the cost:** capture a real request body and count each rung's characters; estimate tokens from that, not from intuition.
