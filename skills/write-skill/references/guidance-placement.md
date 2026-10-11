# Guidance Placement

Read this before deciding where an instruction lives: in always-loaded instructions, a skill description, a skill body, a reference, or a tool's own text.

This reference is judgment: adapt it to the goal. Its binding statements restate [Write Skill](../SKILL.md) Rules.

Goal: each behavior reaches the agent before the decision it affects, at the lowest cost, with one owner.

## The Ladder

| Rung | The agent sees it | It costs | It holds |
| --- | --- | --- | --- |
| 0. Always-loaded instructions (system prompt, runtime prompts) | every request | every request, every session | what an ordinary turn needs before any skill could be read: authority, honesty, reading the request, everyday engineering habits, recovery after context loss, shared terms |
| 1. Skill description | every request | one line per skill | the job and the situations that call for the skill, in the words a user would use; where a neighbor takes over when two would trigger on the same request |
| 2. Skill body | when its activity starts | only when used | the activity's normal route, Rules and judgment |
| 3. Reference | at a named step or observable branch | only when reached | depth for one step or condition |
| Point of use | at the tool call or event | per tool or event | mechanics of that tool or event: a tool's description and guideline, a status line, a notice |

Place each behavior on the lowest rung that still reaches the agent before the decision. A higher rung keeps at most a one-line cue or guard that points down to it.

## Rung 0 Is For Ordinary Turns

Ask: **would a capable agent get this wrong on an ordinary turn, before it had any reason to load a skill?** If yes, it belongs at rung 0. If it matters only once an activity has started, it belongs in that activity's skill; rung 0 needs a cue for it only when the description alone would not get the skill read.

Recovery after context loss stays at rung 0 as a cue: after a compaction no skill is in context, so the cue must say which skill to reload; the method itself stays in that skill.

A rung-0 instruction that appears in two always-loaded files is paid for twice on every request. Give it one owner there before anything else.

## A Description Is A Trigger

The agent decides from the description alone whether to read the body. A description that names internal terms, lists the body's steps, or omits the user's words fails at that decision, however good the body is. Write it per Write Skill's "Write The Description For Recall"; when two skills would match the same request, one short clause saying where the other takes over is worth its words.

## Repeat As A Guard, Not As A Method

A skill may restate a rung-0 rule as a one-line guard where the skill makes the affected choice: rung 0 can be missing on some paths (a host where the user switched a prompt off, a subagent). It does not restate the method around it. When rung 0 and a skill state the same rule, keep the wording compatible; two thresholds for the same behavior ("two or three", "two or more") make the agent choose between them.

## Send Only What Can Be Used

Instructions, skills and tools for a capability that is off are cost without use. Send them only while their capability is effective. A settings change that alters what is sent costs one prompt-cache write; that is acceptable, and repeating unused text on every request to avoid it is not.

## Check A Move

- **Moving guidance down a rung** (from always-loaded to on demand) risks the agent never reading it: compare before and after with the same fixed scenarios on the models in use, aimed at the behavior that moved.
- **Removing a duplicate** whose owner stays at the same or a higher rung: review against Write Skill, plus one smoke check.
- **Rewriting a description:** a trigger check per description, one natural request that should read the skill and one near miss that should not.
- **Measuring the cost:** capture a real request body and count each rung's characters; estimate tokens from that, not from intuition.
