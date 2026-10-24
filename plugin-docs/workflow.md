# How Freeflow Works

Freeflow is guidance for the agent you already use, not a new agent. The agent owns understanding your request, doing the work, checking it and reporting. Freeflow gives it three always-present prompts and ten skills:

- **Core guidance** carries the cycle below, what authorizes work, and how to recover after context loss.
- **The Interaction Contract** tells a question or an idea apart from a request to act.
- **The Working Method** says how to read a request, find what a change touches, keep output small, check evidence and report a finished change.
- **Skills** hold the methods. Each skill's description says when it applies, and the agent opens it when the work matches; a skill opens a reference or runs a script only when its situation arises.

## The Cycle

Work runs in one cycle:

1. **Agree.** Before the first edit on a task that builds or changes behavior, the agent sends what it will do, where it stops, and the choices that are yours, each with its default, then waits.
2. **Build and verify.** It builds within the agreement and checks the result on the path you will use.
3. **Review and hand over.** It reviews its own work, gets an independent review when Review Work's gate calls for one, and hands over with what done looks like against what was done.

When evidence changes the picture, the agent goes back only to the step it affects and keeps the work that still holds. There are no modes and no mandatory phases: a question gets an answer, a one-line exact edit gets made, and a large change gets the whole cycle.

Only your request, or an approval that still applies, authorizes work. A request covers its tools, its checks and reversible local choices; commit, push and release each need their own yes. The agent continues through covered work without asking again, and stops at the agreed end, at a real blocker, or at a choice that is yours.

## Agree Before Building

The agreement is one message:

```text
What I'll do:   Add cancellation to the upload client.
Where I stop:   Tests pass; I won't touch retry behavior or commit.
Your decisions: 1. What a cancelled upload returns. I'd go with a rejected promise
                   with a CancelledError, because the client already rejects on timeout.
Technical:      3 more choices; say "show technical" to see them.
```

"Go", "fine" or "your call" accepts every default. A correction changes only the line it names. The agent lists every choice the request, the code and the docs leave open, technical ones too (names, messages, files); say "show technical" to see them, or tell it you always or never want them.

No agreement is needed for a question, a discussion or a review that changes nothing. An exactly specified change ("change `state=draft` to `state=final` in target.txt"), or a run where no one can answer, such as an unattended run, counts as the agreement: the agent takes its defaults and lists them in its final report.

You can ask the agent to skip an optional step, such as waiting for the agreement, a plan, a review or a record. It skips only what you named, takes its defaults and reports them, still asks before a hard-to-reverse choice, and changes no authority, no checkpoint you selected, and no claim: a check you decline leaves its claim unverified.

The choices are kept in one decision list through the work ([Discuss Work](../skills/discuss-work/SKILL.md)). A choice that comes up later is asked about only when the work cannot go on without your answer; otherwise the agent takes its default and adds it to the list. At the end, the hand-over shows only the choices you have not seen: new ones, changed ones, and defaults nobody answered.

## The Work Agreement

The work agreement is what you and the agent agreed it may do: the outcome, what done looks like, what it does without asking, what needs your yes first, where it comes back to you, and how long that holds. You can hand over a whole task, work one step at a time, or switch between the two, and the agreement follows.

**It grows step by step.** You can agree to the whole route or part of it. At the edge of what you agreed, the agent reports and ends with the next step as a question, such as "Commit this?"; your yes extends the agreement. Work that turns out bigger with the same outcome stays covered. A fix that would change behavior, compatibility or scope comes back to you. Commit, push, merge, release and other separately controlled actions always need explicit cover.

**Steering it.** Say what you want at any point:

- Ask a question or raise a doubt: the agent answers. A doubt about the step in progress is answered before that step goes on.
- Say stop: it starts nothing new, finishes or reverts only what is already running, and reports.
- Narrow it for now ("just diagnose first", "don't edit yet"): that holds until you lift it, also after a compaction, even when a broader agreement is written down.
- Change direction: the agent updates the written agreement in your words, then continues under the new one.

Your latest message always wins over a stored agreement.

**Where it is kept.** The agent keeps it in the lightest place the next context will read:

| Work | Where |
| --- | --- |
| Finishes within the conversation | Nowhere; the conversation is enough. |
| May cross a compaction, no Working Record | The compaction summary's `Work agreement` heading. |
| Has a Working Record | The record's `### Work agreement` section, right after Goal, with your reply quoted next to what it answered; the decision list in the task's `sources/decisions.md`. |
| A long or unattended run, or one whose agreement changed several times | The section, plus `sources/work-agreement-log.md` in the task directory: each exchange that set or changed the agreement, the proposal in one line and your reply word for word. |

A record is never created only to hold an agreement. After a compaction or in a new session, the agent checks the recovered agreement against your latest direction before acting on it. A stored agreement is a record of what you approved, never authority by itself.

In a Working Record, each line starts with the part it states:

```markdown
### Work agreement

- Done when the reported bug is fixed and its PR is open.
- Without asking: fix it, commit on a branch, open the PR. You said "yeah, do that" to that route (2026-10-12).
- Ask first: merging, anything outside the bug.
- Back at the PR.
```

You can edit the section yourself, for example to narrow it before a long run. As with anything stored, your latest message still wins.

## Skills

Each skill is one capability. Its first page covers the common case and a table of situations; references hold the rest, read only when their situation arises, and scripts put the facts a decision needs in front of the agent.

| Skill | Use it when | Command |
| --- | --- | --- |
| [Discuss Work](../skills/discuss-work/SKILL.md) | What to do or how is still open; agreeing before building; a choice or conflicting sources mid-work; skipping an optional step | `/discuss-work` |
| [Execute Work](../skills/execute-work/SKILL.md) | Implementing, fixing, refactoring or simplifying; designing modules or interfaces; finding why something fails; migrating to a replacement | `/execute-work` |
| [Verify Work](../skills/verify-work/SKILL.md) | Checking whether work or a claim holds: tests, builds, the real path; setting up or rechecking saved live checks of your software | `/verify-work` |
| [Review Work](../skills/review-work/SKILL.md) | Judging whether work, a spec, plan, skill, eval or report is fit to use; your own before handing over, or another's | `/review-work` |
| [Deliver Work](../skills/deliver-work/SKILL.md) | Committing, pushing, merging or opening a pull request, cleaning up a branch, releasing, deploying | `/deliver-work` |
| [Track Work](../skills/track-work/SKILL.md) | A task that needs memory beyond the conversation: its Working Record, recovery after context loss, a handoff to another session or person | `/track-work` |
| [Write Docs](../skills/write-docs/SKILL.md) | A spec, plan, decision record or ADR; user or developer docs; docs a change made wrong | `/write-docs` |
| [Setup Freeflow](../skills/setup-freeflow/SKILL.md) | Activating Freeflow in a repository, repairing its configuration, checking delivery | `/setup-freeflow` |
| [Write Skill](../skills/write-skill/SKILL.md) | Writing or revising a skill or other text an agent acts on, such as `AGENTS.md` | `/write-skill` |
| [Evaluate Behavior](../skills/evaluate-behavior/SKILL.md) | Testing or comparing how an agent behaves with a skill or setup change | `/evaluate-behavior` |

The commands are Pi's; Claude Code calls the same skills as `/freeflow:<skill>`, and Codex by mentioning the skill. Natural language works as well: the agent opens the skill whose description matches. A skill is a method, never permission; naming one does not authorize what it describes.

On Pi, Freeflow's optional capabilities add skills of their own while they are on: Cognitive Routing, Compaction, Task Memory and Messaging.

### Scripts the skills run

The agent runs these itself; you see their output in its report. They are under each skill's `scripts/` folder:

| Script | What it answers |
| --- | --- |
| Execute Work `touch-map.mjs` | What a change touches: entry points, readers, writers, scheduled code, covering tests and developer docs, each block saying what it did not search. |
| Execute Work `self-review.mjs` | One report before handing over: status, diff stat, every changed existing test or fixture with its hunk, each new test and whether it fails on the base, whether each requirement's check ran after the last edit, and the feature files covering the change with whether each was driven live since. |
| Verify Work `test-changes.mjs` | Every test, fixture or test setup file changed since a base commit, with its hunks; `--new` lists added test files. |
| Discuss Work `choices.mjs` | Checks the decision list and renders the agreement, the hand-over's unseen choices, and a catch-up after an unattended run. |
| Review Work `review-packet.mjs`, `check-brief.mjs` | Prefills an independent reviewer's brief, names the review gate's triggers and round budget, and refuses a brief with a missing line or a path that does not exist. |
| Deliver Work `delivery-state.mjs`, `commit-state.mjs`, `release-preflight.mjs`, `push-route.mjs` | Branch, upstream, uncommitted work, worktrees, tag, version and changelog in one read; your changes apart from pre-existing staged work; local checks of a release or a simple push, without performing either. |
| Track Work `working-record.mjs view recover` | After context loss, in one call: the record's present state with an index of closed History, each defining artifact and recovery source and whether it resolves, and where live Git state disagrees with the record. |
| Write Docs `docs-check.mjs`, `plan-lint.mjs`, `artifact-check.mjs` | Paths a document names that do not exist and docs whose code changed; Plan steps that name no check; a Spec, Plan or decision record's status and source trail. |
| Write Skill `skill-author.mjs compare` | What a revision of a skill or instruction file no longer says, and which dropped rules still need a verdict. |

On Pi with Tool Execution on, a few of these lines also arrive at the tool call that needs them: the commit essentials on a `git commit` result, the diagnose method's key lines when the same test fails twice, and a reminder to run `self-review.mjs` when a test passes after a change. The Guidance notices row in `/freeflow settings` turns them off ([Tool Execution](capabilities/tool-execution.md#guidance-notices)).

### What changed in 0.9.0

Freeflow 0.9.0 has ten skills instead of twenty-five. The removed names have no aliases; their methods moved here:

| Removed | Now |
| --- | --- |
| Workflow | The cycle in core guidance; routing through each skill's description |
| Action Selection | The Working Method's "Keep output small" |
| Bypass | Discuss Work: asking to skip an optional step |
| Discuss, Agree Work | Discuss Work (`/discuss-work`) |
| Commit Work, Finish Branch, Release Work, Launch Work | Deliver Work (`/deliver-work`) |
| Design for Depth, Simplify Code, Diagnose Failure, Migration Work | Execute Work (`/execute-work`) and its references |
| Handoff | Track Work's handoff reference |
| Write Spec, Write Plan | Write Docs (`/write-docs`) |
| Map Features | Verify Work's feature map reference (`/verify-work`) |

## Activation And Configuration

Freeflow requires a valid shared `.freeflow/config.json`. Optional `.freeflow/local.json` supplies per-checkout personal overrides and cannot activate Freeflow by itself. The only core enablement switch is `enabled`; base Freeflow skills and the Interaction Contract are present whenever Freeflow is enabled. Cognitive Routing, Tool Execution, Compaction, Task Memory and Messaging are optional capabilities. The former context settings `contextVirtualization` and `conversationHistory` are unsupported and make either config layer invalid until removed.

```text
host session enablement -> personal override -> repository value -> built-in default
```

Configurations containing the removed `defaultMode`, `interactionContract`, or `skills` keys are invalid. An invalid existing local config fails closed instead of silently inheriting shared settings. Session state cannot bypass missing or invalid repository activation.

Pi `/freeflow settings` edits personal overrides; `/freeflow settings session` edits temporary enablement and optional-context overrides; `/freeflow settings repo` edits shared configuration. On a qualified native Pi host, session settings also expose complete overrides for Cognitive Routing profiles enabled in that session that do not mutate either config file, take precedence over personal and repository profiles, and can inherit or reset independently. [Settings](settings.md) lists every key.

## Authority And Effects

Questions, criticism, examples, hypotheses and tentative ideas stay discussion until you ask for action. Skill selection, useful follow-on work and new evidence do not widen what you asked for.

Actions have different effects:

- **Passive observation:** inspect existing evidence or sources without exercising target behavior or intentionally changing task state.
- **Active evidence generation:** exercise target behavior to produce new evidence.
- **Mutation or delivery:** change repository, durable task or session, or external state.

Passive observation may support an inquiry when safe and relevant. Active evidence generation, mutation or delivery, and separately controlled actions need cover from your request or a still-valid approval. When one is not covered, the agent explains why it is needed, exactly what will happen, what it should produce, and where it will stop; asks once, and waits. Evidence supports reporting; it does not by itself authorize a correction or the next step.

## Review And Verification

Verification is factual work by the agent: a check supports only what it observed, on the path it ran. A real passing result stops applying after relevant edits. A check you decline leaves its claim unverified.

Self-review runs on every finished change, silently, before the hand-over. It covers the decision list and justifies every change to an existing test, fixture or setup. Clear local issues within the agreed outcome may be corrected and re-checked.

An independent review is a separately selected reviewer in a separate context. Review Work's gate decides when one runs, by the `review` setting: `auto` (the default) reviews when the change touches security, auth or secrets, data loss or migrations, CI or release files, a public interface, a path your Review Rules mark sensitive, or anything your agreement names; `off` proposes one with its reason and cost and runs it only on your yes; `always` reviews every time. Switching Cognitive Routing profiles is not independent review.

Review findings are evidence, not commands. An accepted correction that your agreement covers goes back to Execute Work; otherwise the agent asks once. Review budgets cap rounds; they do not authorize another review.

## Artifacts

- **Working Record:** living task context (including the optional Work agreement and the decision list), one Current Slice, ordered Future Work, Decisions, Slice-local Evidence and Blockers, History, Notes, and the next action ([Track Work](../skills/track-work/SKILL.md)).
- **Spec:** accepted content, behavior, boundaries and uncertainty ([Write Docs](../skills/write-docs/SKILL.md)).
- **Plan:** an ordered execution strategy when dependencies, mechanism and checks can be stated without guessing (Write Docs).
- **Handoff:** point-in-time continuation context for a pause or transfer (Track Work).

Artifacts preserve content or strategy; they are not proof, and they do not outrank your current direction or live evidence. Writing one never adds an approval step to work you already covered.

## Task Continuity

After context loss (compaction, a summary that replaces the conversation, clear, a resumed or navigated session, or a transfer into another context), the agent recovers the Working Record when one exists, in Track Work's order: `working-record.mjs view recover` (the record's present state, an index of closed History, each defining artifact and recovery source, and where live Git state disagrees), then the artifacts that define the task, its recovery sources, then the closed History entries the next action depends on, by ID. It stops affected work if recovery is incomplete. With the conversation still in context, a new message, a pause or a resumed session is not context loss.

A recovered record restores memory, not authority or proof that its evidence is still current. The agent reconciles it with your current direction and live state, then continues covered work without needing another "continue".

## Checkpoints And Closeout

Independent review, a local commit, a user decision and a continuity transfer are checkpoints only when selected; a Slice ending alone does not require one. Commit, branch integration, migration, release, launch and destructive cleanup stay separately controlled.

The agent may end by answering, waiting, pausing, handing off, deferring, stopping at a controlled boundary, or completing. Completion needs fresh verification, self-review, resolved selected reviews, accurate task memory, the docs the change made wrong corrected, and no hidden choice of yours or source conflict.

## Cognitive Routing

On native Pi with Cognitive Routing on, the cycle runs in the Coordinator, the profile you talk to. It delegates bounded assignments to a Helper or Executor and assesses what they return; a worker's report does not complete a Slice, task, commit, release or launch. Routing changes where computation runs, not who decides or what is authorized. See [Cognitive Routing](capabilities/cognitive-routing.md).

See [Skill routing](../dev-docs/subsystems/skill-routing.md) for how the skills, references and scripts depend on each other.
