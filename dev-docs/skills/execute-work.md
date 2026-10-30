# Execute Work

> **Covers:** `skills/execute-work/`
> **Tests:** `.skill-eval/execute-work/`
> **Verified at:** `da60e21c` (2026-10-30)

For anyone changing Execute Work: what it is meant to change, why it is shaped the way it is, and what the evidence shows. The method itself is in [the skill](../../skills/execute-work/SKILL.md); this record holds the reasons it does not. It was started with the delegation reference, so it records that reference's reasons in full and the rest of the skill's only in outline (Open Questions).

## Purpose

Execute Work is read before an agent's first tool call on any task. It carries the task from reading the request to a checked result: what the request asks and implies, what the change touches, one method at a time, re-entry when the basis changes, and the report. Its delegation reference covers handing parts of that work to other agents, and doing work from another agent's brief.

## Behavioral Claim

- **Behavior it produces:** the request read in three layers before the first edit; what the change touches queried rather than imagined; one method at a time; checks where the result is used; a report that says exactly what exists. With the delegation reference: work handed out only where it pays; the smallest capable model by default and the strongest only with the user's yes; briefs that point to files; writers in their own worktrees; returns checked before they are accepted; each delegation's model, effort, tokens and minutes recorded; a worker's sub-workers, always on the smallest capable model.
- **Failure it prevents:** for delegation, the bookkeeping failures of one long coordinator session: a brief overwritten, briefs and reports mixed in one folder, a reviewer working in the shared checkout, worktrees made by hand, a fan-out larger than what was used, a harness that slipped the user's message into reviewers' prompts, an idle coordinator, a push before its check.
- **Earliest decision:** before the first tool call, which core names; for delegation, the moment the agent is about to start another agent, and a worker's first command.
- **Cues before the body is read:** its description, which names handing work to subagents or parallel workers and working from another agent's brief, and core's cycle step. The delegation reference is reached from core's cycle step, which names it whenever work goes to another agent, with or without a task (2026-10-30: in one Claude Code session two of three subagents were started with no brief while the method sat only in the body's Routes row, task-001's friction log F32), from the body's Routes row, from the pointers in Write Skill (trials), Review Work (reviewers) and Research Work (workers), and, for a worker, from its brief's Read section.
- **Guaranteed context:** the description on every host; core where Freeflow's runtime prompts are on. A worker may have only its brief, so the brief points it to the reference's worker section.
- **Nearby cases it leaves alone:** Cognitive Routing's profiles on Pi, which keep their own Coordinator and worker references; a reviewer's brief and report, which stay Review Work's; the split of a research subject and the checks on its returns, which stay Research Work's; a trial, which stays Evaluate Behavior's.
- **When it stops steering:** at the agreed return condition; the delegation reference once the last return is checked and recorded.

## Design

- **Delegation is a reference in Execute Work, not a skill of its own** (agreed with the owner on 2026-10-28, in task-003; task-004's design, P52). Handing work out is part of carrying it out, a separate skill's description would match the same requests as Execute Work's, and Write Skill prefers depth to width. Write Skill's trials, Review Work's reviewers and Research Work's workers point to it where each starts an agent, and each keeps what is its own.
- **Cognitive Routing is untouched** (task-004, P27). Its Coordinator and worker references hold the same method for one Pi session switching profiles, with the tools, projection and recovery requests only it has. The reference says so in its opening paragraph and does not link the capability package.
- **Rules only for what is wrong in every case:** one writer per file; no two agents writing in one checkout; no user-owned choice handed to a worker; a return is not acceptance; the strongest model only with the user's yes, since cost is the user's. The rest is judgment, including the model table, which a user's own model policy overrides.
- **Models by tier, named for Claude.** The text says "the smallest capable model" and "the strongest model", with Haiku and Opus as the Claude instance, because Freeflow's skills run on other hosts too.
- **One folder per delegation, kept by Track Work's commands where the record is Schema 5.** `delegations/D-NNN-<slug>/` holds `brief.md`, `progress.md` and `return.md`, with the headings task-004's design gives them. With no task, `delegate open --scratch` and `check-return --scratch` keep the same folder in the scratch folder and record nothing, so the method is the same with or without a task. With a Schema 5 record, Track Work's `delegate open`, `amend`, `check-return` and `close` write the brief, make a writing worker's worktree, check a return's shape and commits, and keep the delegation's line and History entry, and `view recover --delegation` is a worker's recovery; the reference names each command where its step is. A Schema 4 record had no Delegations section and its `D-NNN` named Decisions, so there the folders and lines were hand-kept, named by folder path, until `migrate` converted the record to Schema 5.
- **Delegations apart from Slices** (task-004, P57). A delegation has its own lifecycle and closes on its own; the coordinator's Slices are its own work and never wait open on a worker, so workers run asynchronously. A Slice that needs a result names the delegation it waits on, and accepting a return (the check, the merge, the merge commit) closes the delegation. Schema 4 records, which only `migrate` reads now, had no Delegations section, so the dispatch and outcome lines went on the Current Slice when one was open and otherwise in a Recovery source pointing to the folder, which recovery read. Rejected: delegations as parts of the Slice that opened them, which held that Slice open, and with one Current Slice the coordinator's next work, until every worker returned.
- **Absolute paths in briefs.** A worktree does not contain the task directory, which Git ignores: in one fan-out, each of 20 worktrees saw only `.freeflow/config.json`.
- **Nesting to three levels: coordinator, worker, sub-worker** (task-004, P23 and P56). A worker decides whether to hand part of its assignment down, by the same judgment as the coordinator. The coordinator chose its model by the level of the work, so it is usually a worker on the strongest model, doing a share of the coordinator's own work, that hands mechanical checks, gathering or research to sub-workers. A sub-worker always runs on the smallest capable model, since it exists to make its worker's job easier, and a part that needs a stronger one becomes another worker the coordinator starts and manages; so only the coordinator asks the user for a stronger model. A sub-worker's folder sits inside its worker's, the nearest brief wins, and a choice goes up one level at a time. Claude Code lets a subagent start its own, up to three layers below the main conversation by default (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, v2.1.219 and later), so a sub-worker is its worker's own Agent call.
- **The context checked when the route is set** (task-004, P79). Establish The Execution Basis has a Context line: before the first effect, whether the route fits in what is left of the context before the next compaction, measured with Track Work's `estimate`, and work that will go on past it needs a task. It says this in plain words, since "compaction cycle" is Track Work's term (task-004, P82). It sits there because the route is set there; whether to create a task stays Track Work's, on the user's word.
- **The worker's side in the same reference,** with no separate Track Work reference for workers (task-004, P36). A worker reads Execute Work anyway, and its brief points to the reference's worker section, so the first read does not depend on the worker finding it.

- **Return points instead of selected Checkpoints** (task-004, P71). The Rule against crossing a stop names the work agreement's return point (a Schema 5 record's `Back at` line), since "checkpoint" now means only Track Work's save before a compaction; a Schema 4 record's Checkpoints had their method in Track Work's Schema 4 reference, since removed.

## Evidence

| What | Result | Where | Limits |
| --- | --- | --- | --- |
| How one coordinator delegated | 115 Agent calls over about 33 hours (Haiku xhigh 96, Opus 16); 103 returns; every Opus build return reread and retested before its push; one reviewer worked in the shared main checkout; merge order explained to the user five times; the coordinator idle twice | Outside the repository: task-004's `sources/delegation.md`, sections 1 and 7, counted from task-001's session transcript | One session, one coordinator model, one container; the counts describe what happened, not rates |
| What delegation cost | 103 calls with usage, 28.1M tokens as the harness reports them, cache reads included; Haiku made 85 of them; a reader that made 3 tool calls cost 103k tokens; one 27-agent fan-out was 31% of all subagent tokens; reviews of PRs and papers about a quarter | Outside the repository: task-004's `sources/agent-ledger.md` | Only agents whose notification carried usage |
| Pointer briefs | A brief pointing to its inputs found the same 27 of 30 defects as the pasted prompt, at about 16% lower cost per review | [Verification, Review and Evaluation](../subsystems/verification-review-evaluation.md), the R-a trial | Work reviews only, one reviewer model |
| Returns in files | The median hand-back fell from 8,573 characters to 392 once reports went to files | Outside the repository: task-004's `sources/delegation.md`, section 7 | 3 hand-backs before, 64 after |
| A harness adds context | Claude Code's Workflow tool put the user's latest message, framed as the request, in front of 229 of 248 held-out reviewers | Outside the repository: task-004's `sources/delegation.md`, section 1.1 | One tool, one session |
| A settled brief on a small model | Haiku 5.5 solved 15 of 19 tasks when the decisions the hidden tests check reached it, against 8 from the issue alone; Opus 5.5 solved 11 from the issue alone | Beyond the Weights, Study 4 (the preprint in task-004's `sources/papers/`) | The decisions were written with the tests and the reference fix in view, so 15 is an upper bound; Opus ran once per task and may have seen the upstream changes: scale, not a ranking |
| Effort | Higher reasoning effort raised cost while success did not reliably follow | Beyond the Weights | Exploratory, not tested by that study's decision rule |
| Concurrent writers | With concurrent `decision add` writers on one record, one write in 20 that reported success was lost | Outside the repository: task-004's `sources/delegation.md`, probe P-D1 | A local stress test; never observed in real work |
| This build's own delegation | Task-004's D-001, one Haiku xhigh review of the Track Work rewrite: 396,411 tokens and 11 minutes, Non-blocking with seven items accepted. The reviewer read files with shell commands beyond its brief's `May run` list, and said so | Outside the repository: task-004's `delegations/D-001-review-track-work-rewrite/` | One delegation. Its friction went to Review Work's two briefs, which now say that reading is inspection, not a check |
| Package checks | `skill-author validate` with the routing map, `compare --all-units` and `similarity`, for the change that added the reference | Run on that change | Structure, not behavior; the reference has no behavioral evaluation |

## Rejected

- **A separate delegation skill** (`delegate-work`, proposed in task-003's research): its description would overlap Execute Work's, and handing work out is part of doing it.
- **Moving Cognitive Routing's general method into the reference:** Cognitive Routing stays as it is.
- **Workers writing the Working Record:** concurrent writers lost a write that reported success.

## Dropped

None recorded before this record was started.

## Open Questions

- The reasons for the rest of Execute Work (the three layers of a request, `touch-map`, `self-review`, the routed references) are not recorded here yet.
- The reference's first real use is task-004's own build; its friction log is adjudicated before the reference changes.
- Whether a worker reads the reference's worker section when its brief points to it is not measured.
- Nesting has not been used yet: whether workers hand work down only where it pays, and whether a sub-worker's choices reach the coordinator one level at a time.
