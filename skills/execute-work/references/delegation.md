# Delegation

Read this before handing work to another agent: a subagent, a parallel worker, an independent reviewer, a trial user of a skill, an eval or research agent, or a fan-out of many. Read it as that agent too, before your first command. It is judgment, except the Rules, which bind. On Pi under Cognitive Routing's automatic control, its Coordinator and worker references govern its own profiles; this reference covers the agents you start.

The **coordinator** is the agent the user talks to. A **worker** does one assignment from a brief and hands back a return. A **sub-worker** is a worker's worker, the third and last level.

## Rules

- One writer per file. Only the coordinator writes the task's Working Record and its decision list. The agent that hands work out writes its brief, and only it merges that work's branch into its own; a worker writes only its own `progress.md` and `return.md`, the files its brief's Scope names, its own branch, and its sub-workers' briefs. Concurrent writers to one record have lost a write that reported success.
- No two agents write in one checkout. A worker that writes, including one that builds or runs checks, gets its own worktree at the base its brief names before it starts; whether a worker that only reads gets one is your call.
- A choice the user owns is never handed to a worker. A worker that reaches one stops and returns it; only the coordinator asks the user, through [Discuss Work](../../discuss-work/SKILL.md).
- A return is not acceptance. Check it, as Check The Return says, before recording its result or building on it.
- Start an agent on the strongest model only with the user's yes, unless the work agreement or the user's standing policy covers it; ask with the reason, the effort and roughly what it will cost.

## Decide Whether To Hand It Out

Goal: hand out only work where the saving exceeds what handing it out costs.

Every agent pays a fixed price before it does anything: its brief, the files the brief points to, and the skills it loads. The coordinator pays again to check the return. A worker that made three tool calls has cost over 100k tokens. Hand work out when it buys one of these:

- **parallel time:** parts that do not depend on each other run at once;
- **a cheaper model:** work whose decisions are already settled, done by a smaller model;
- **a smaller coordinator context:** a trail of reading, searching or runs that the coordinator would otherwise carry, replaced by a short return.

Keep a tight edit, check and interpret loop with one agent: a fix you know after a failing test is quicker made than briefed. Gathering the callers and conventions before a change, a batch of checks after it, and reading many sources each qualify.

The kind of difficulty suggests the owner:

- missing facts: a worker reads or gathers;
- settled mechanics: a cheaper worker, or a script when the work repeats;
- a design or governing choice: the coordinator;
- a choice the user owns: the user.

## Choose The Model And Effort

Goal: each part runs on the cheapest model and effort that can do it well.

| Work | Default |
| --- | --- |
| Reading, gathering, web research, mechanical fixes, running evals, independent reviews, building what the brief has settled | The smallest capable model (on Claude, Haiku) at high effort (`xhigh`) |
| Design, synthesis, judging what a review or a study means | The strongest model (on Claude, Opus), at most `high` effort, with the user's yes (Rules) |

Spend the strong model on settling what the brief decides, and the small one on doing it. Choose effort by the job, not the maximum: higher effort raises cost more reliably than it raises success. A model policy of the user's, such as a reviewer model they set, overrides this table. Name the model and effort in every brief.

What past work cost helps you weigh it: Track Work's `working-record.mjs estimate --plan` prints the measured context, time and list-price cost of past delegations by kind, model and effort, `--fan-out <n>` prices n workers, and `estimate --store` adds up every task's. The figures show the cost; this table and its goal, a model that does the work well, still choose.

## Write The Brief

Goal: the worker can act correctly on its first attempt from what it can see.

Each delegation has a folder in the task directory, `delegations/D-NNN-<slug>/`, numbered in sequence; with no task directory, use your scratch folder. The agent handing the work out writes `brief.md` there. With a Schema 5 Working Record, Track Work's `working-record.mjs delegate open` does it: it assigns the ID, writes the brief from this template with the sections you give it, makes a writing worker's worktree (`--repo`, `--base`), and records the delegation. Otherwise write it by hand:

```markdown
# D-012 — <title>
Task: <task> · From: S-024 (the Slice that opened it, when one did) · Continues: D-009 (when it does)
Agent: <model>, <effort> · Kind: build | review | research | eval | gather · Handle: <the host's ID for the agent>
Space: <repository> worktree <path> at <commit>, branch <name> | the coordinator's checkout (read only)
## Result wanted
## Scope                    may write: …   must not touch: …
## Settled                  what is already decided that bears on this part
## Read                     pointers
## Done when                the evidence that shows it is done
## Return when              done, blocked, or a choice that is not yours to make
## Changes                  appended later, dated
```

`D-NNN` numbers delegations. In a record whose History also holds `D-NNN` Decisions, write the folder path wherever the record names a delegation. An independent reviewer's brief and report are [Review Work](../../review-work/SKILL.md)'s, kept where it says; the rest of this reference still applies to starting and running it.

- **Point, do not paste.** Name the files, sections, commits and line ranges, and let the worker read them: it reads only what it needs, and the coordinator's context stays small. A worktree does not contain the task directory, which Git ignores, so give absolute paths to the delegation folder and to sources kept there.
- **Write for what the worker can see,** not what you remember: the result and why it matters; the facts and decisions already settled; the scope and the effects it may cause; the names, messages, interfaces and file locations it must not choose, exactly as they must appear; the evidence you need to judge the result; and when to return.
- **State each requirement as an outcome for a named thing** ("each caller listed below still gets X"), with no escape clause such as "unless needed": a smaller model applies one literally.
- **Ask a gathering worker what to learn,** not what you expect it to find: a brief that states the hoped-for answer steers the report.
- **Put the rules every worker shares in one file** the briefs point to, such as `delegations/common.md`: its own worktree only, no push, how commits are authored, no network or paid runs unless the brief names them, and every choice it made listed in its return.
- **Point the worker to [Work From A Brief](#work-from-a-brief)** in the brief's Read section.
- **Size the assignment** to hold the work, its checks, the corrections they are likely to need, and the return. A brief longer than the change it asks for is the work done at the coordinator's price.

## Keep Delegations Apart From Your Slices

Goal: workers run on their own time, and your own work never waits for theirs to close.

- A delegation is not part of a Slice. Your Slices are your own work and open and close whatever the workers are doing; a delegation has its own lifecycle: opened, running, returned, then closed as accepted, sent back or stopped.
- A Slice that needs a delegation's result waits for it: name the delegation in the Slice's `Waits on` (with a Schema 4 record, its folder in the Slice's Dependencies), and close the delegation before using the result. Never keep a Slice open only because a delegation is still running.
- Closing a delegation accepts its return: check it as Check The Return says, merge its branch, and record the merge commit. Work beyond that, such as resolving conflicts between parts, is a Slice of yours.
- With a Schema 5 record, `delegate open` writes the delegation's line in Current Work's Delegations and `delegate close` records its outcome; nothing else needs writing. With a Schema 4 record, record each dispatch by hand through [Track Work](../../track-work/SKILL.md) where the record holds current work, with the folder's path: a line on the Current Slice when one is open, `Delegation — D-012 (build, <model> <effort>): running; delegations/D-012-<slug>/brief.md`, and otherwise a Recovery source, `delegations/D-012-<slug>/ — D-012 (build, <model> <effort>): running; read when it returns`. Record its outcome the same way when it closes, wherever the record holds current work then.

## Run Workers In Parallel

Goal: workers run at once without overwriting each other, and the fan-out is no bigger than what you will use.

- Give each writer its own worktree and branch at a stated base, outside the coordinator's checkout: `delegate open --repo <repository> --base <commit>`, the host's worktree isolation, or `git worktree add -b <branch> <path> <base>`. Before starting them, compare the files each brief lets its worker write, and run workers that share a file one after the other.
- When branches stack, state the order they merge in.
- Size a fan-out by what you will read and use, not by what could run: one wide fan-out can cost more than every other agent in the task together. Price it first with `estimate --plan --fan-out <n>`.
- Before scaling a fan-out, read one worker's prompt as the host delivered it: a harness can add context of its own, such as the user's latest message framed as the request.
- Run many identical assignments through a script or the host's workflow tool rather than one call each, within the host's limit on agents running at once.

## Work While Workers Run

Goal: no one waits idle, and no worker builds on a premise that has changed.

- Run workers in the background and keep doing independent work, in paths no worker writes.
- When a return or the user's new direction changes a running worker's premise, append the change, dated, to its brief's Changes (`delegate amend --id D-012 --text <change>`) and tell the worker, or stop it.
- Another round for the same result keeps the folder: the brief gets a dated change, `progress.md` continues, and `return.md` is rewritten. Resume the same agent when the host can, since it still holds its context; a fresh agent can take over the folder, since the files carry the work.
- After your own context loss, the open delegations are the record's Delegations lines (with a Schema 4 record, its Delegation lines and delegation Recovery sources) and the folders without a finished return.

## Work From A Brief

Goal: as a worker, produce the brief's result within its scope, and hand back what the agent that briefed you needs to judge it.

- The brief is your scope. Where it and the Working Record disagree, the brief wins, and a dated change in it overrides the earlier text.
- When part of your assignment is worth handing down, hand it down as [Hand Work Down One Level](#hand-work-down-one-level) says, and brief them as Write The Brief says.
- Write only what its Scope allows, in your own worktree. Choose ordinary mechanics yourself and list them in the return. A choice that is not yours, a premise the work disproves, or a choice the user owns ends the round: return it.
- Keep `progress.md` in the delegation folder, rewritten before your context is compacted, so you or another agent can pick the work up:

  ```markdown
  # D-012 progress
  As of: <time>
  ## Done          with commits and files
  ## Half done     and how to pick it up
  ## Didn't work   so it is not tried again
  ## Next
  ```

- Write `return.md` at the end of each round:

  ```markdown
  # D-012 return
  State: done | blocked | stopped
  ## Result
  ## Identities    branch, commits, files
  ## Checks        what ran and what it showed; what was not verified
  ## Left open     choices the brief did not settle, and what you took
  ## Not done
  ```

  An independent reviewer, or a trial's subject keeping a friction log, writes Review Work's report instead.

- Your reply to the agent that briefed you is the delegation ID, the return's path and one line. Where the host refuses a worker's files, reply with their content instead, and that agent saves it unchanged.
- After context loss, read `brief.md`, then `progress.md` and `return.md`, before anything else, and continue from `progress.md`'s Next. With a Schema 5 record, the recover command in your brief's Read section (`view recover --delegation D-012`) prints the three first.

## Hand Work Down One Level

Goal: a worker can hand part of its assignment to sub-workers, and the coordinator still knows what ran and what it cost.

- A worker decides whether to hand part of its assignment down, by the same judgment as [Decide Whether To Hand It Out](#decide-whether-to-hand-it-out). The coordinator chose its model by the level of the work, so it is usually a worker on the strongest model, doing a share of the coordinator's own work, that hands mechanical checks, gathering or research before a step to sub-workers.
- A sub-worker always runs on the smallest capable model. When a part needs a stronger model, the worker asks the coordinator to start another worker for it, which the coordinator manages; this is rare.
- A sub-worker's folder sits inside its worker's, `delegations/D-012-<slug>/D-012.1-<slug>/`, with the same three files; with a Schema 5 record, `delegate open --parent D-012` makes it, and refuses a fourth level. The worker writes its brief, keeps its scope inside the worker's own, checks its return as Check The Return's first four steps say, and merges its branch.
- The nearest brief wins: a sub-worker follows its own brief, and its worker's brief governs that one.
- A choice that is not a level's to make goes up one level at a time: a sub-worker returns it to its worker, which settles it if its own brief lets it, or returns it to the coordinator. Only the coordinator asks the user or writes the record.
- The worker's return reports its sub-workers' results, with each one's tokens and minutes, so the coordinator's outcome line counts them.
- A sub-worker starts no agents of its own.

## Check The Return

Goal: accept only what the evidence supports, and choose the next step from the gap.

1. Check its shape: the return's headings are there, and every commit it names exists on the branch it names. With a Schema 5 record, `delegate check-return --id D-012` checks both.
2. Read the return, then the diff against the base; a summary is not the work.
3. Rerun the check that decides the result, and recompute any number the result rests on.
4. Judge it against the brief's Result wanted and Done when. A plausible but different name, location or behavior shows a decision the brief left implicit: improve the next brief from it.
5. As the coordinator, record the outcome with the tokens and minutes the host reports and, when you merged its branch, the merge commit. With a Schema 5 record: `delegate close --id D-012 --outcome accepted | sent back | stopped --merge <commit> --tokens <n> --minutes <n>`, which writes its History entry and removes its line; where it can read the worker's own log (on Claude Code, beside the session's), it also measures what the worker used, so you type no figure. With a Schema 4 record, where the record holds current work: `Delegation — D-012 (build, <model> <effort>): accepted | sent back | stopped; <tokens> tokens, <minutes> min; delegations/D-012-<slug>/return.md`, then drop its Recovery source if it had one. That closes the delegation.

Then choose from the gap. A supported result: continue. A missing observation: ask for it, in the same folder. A defect: send it back with the evidence. An approach the evidence invalidates: change the direction rather than repeat the demand. A choice the user owns: ask the user.

## Review Once, Cheaply

Spend effort up front, on the brief and the checks, and review once: one independent reviewer on the smallest capable model, at the boundary that needs it. Review Work decides whether a review runs, and owns its brief and report.
