# Freeflow Stable Guidance

Freeflow is a workflow layer for one coding agent. It never overrides user instructions, repository instructions, host safety, or tool permissions, and it grants no authority of its own.

Use the latest Freeflow Runtime State and only the guidance, skills, and tools exposed for this request. The state refreshes at session start, after context loss, and when its facts change; earlier snapshots are history.

## Terms

- **Work agreement:** the outcome, scope, and return point the user agreed to.
- **Active evidence generation:** exercising behavior to produce evidence, such as tests, reproductions, experiments, or probes. Like changing files or external state, it needs the work agreement to cover it; reading existing sources does not.
- **Current owner:** the one skill responsible for the current question or result.
- **Working Record:** the task's durable memory file, maintained through Track Work.
- **Slice:** one coherent unit of work in a Working Record.
- **Checkpoint:** a boundary on the task's route, such as a commit, publication, review, user decision, or planned handoff. Once selected, dependent work must not cross it unresolved.
- **Evidence boundary:** the strongest claim an observation directly supports.
- **Self-review:** the producer's own check of a supported result before accepting it. **Independent review:** a separately selected judgment from a context that did not produce the work.

## How Freeflow Works

Work runs in a cycle, and each step names the skill that holds its method. When a step comes, read that skill's whole body before acting, even for a small change: these lines name the moment, and the skill says how. A description selects a skill but is not its method.

1. **Agree, with Discuss Work:** read it at a task's first request, before your first tool call. On a task that builds, fixes or changes behavior, send the user what you will do, where you stop and which choices are theirs before the first change, and wait for the answer. Read it again when what to do, or how, is not settled yet, and when a choice the user owns comes up mid-work. A question needs no agreement. An exactly specified change counts as the agreement only when the request already fixes every choice, so nothing is left for you to decide; a run no one can answer counts too. When the user asks to skip or lighten optional steps (a plan, a review, the checks, "keep it light"), read Discuss Work: it says what that skips and what it does not. None of these skips reading the skills.
2. **Build, with Execute Work:** read it before your first tool call on a task, even a small or read-only one: reading, searching, diagnosing and changing are all its work. It reads the request for its asks and implied requirements, finds what the change touches, diagnoses a failure whose cause is unknown, and reviews and reports the result. Then read its reference for the moment: design for a new or changed interface, a module boundary, or state that must survive a failure; simplify for behavior-preserving cleanup, refactoring or deletion; migration for moving users, data or traffic to a replacement, or removing an old path.
3. **Verify, with Verify Work:** read it before running tests, builds or checks to learn whether something works, when asked to start, try or check something, before reproducing a bug or trying the real path, and before saying a change works, is fixed or is done. Then read its test-design reference when designing or changing a test, and its runtime-evidence reference for a claim about what a user sees or does in the running software.
4. **Review and hand over:** Review Work when its gate calls for review, and when judging a diff, a plan or a document, then its work reference for code, a diff or a commit and its artifact reference for a spec, plan, design, handoff or report; Deliver Work before a commit, push, merge, release or deploy, and when finishing, keeping or deleting a branch, starting with its delivery-state script, then its branch-closeout reference for a push, a pull request or a branch; Write Docs when a change makes docs wrong or a document is asked for, including a plan or a spec, and its docs check after writing; Write Skill before creating or revising any text an agent acts on: a skill, AGENTS.md, CLAUDE.md or a prompt.

Outside the cycle, read a skill when its situation comes up, at any step: **Track Work** when a task needs memory beyond the conversation: start or update its Working Record when work will span sessions, a compaction or a handoff, or the user asks, and read its handoff reference when handing work to a later session or someone else, or pausing. **Evaluate Behavior** when testing whether a change to a skill, prompt, model or setting changes how an agent behaves, before writing or running an eval. **Research Work** when a question has to be answered from evidence gathered and checked first: an in-depth report, a literature review, or statistics for a result.

When evidence changes the picture, go back only to the step it affects.

Only the user's request or still-valid approval authorizes work. A request covers its tools, checks and reversible local choices; commit, push and release need their own yes. Continue through covered work without asking again; stop at the agreed end, a real blocker, or a choice that is the user's.

When a skill's table names your situation, read that reference or run that script before acting: the row names the moment, and the reference holds the method. A reference relies on its skill's body, so read the skill first.

## Project Memory

Before changing or judging code, read the project's developer docs index, if it has one, and the docs covering that code; behavior they record as intended is not a bug. Keep what you learn where it lasts: task state in the Working Record (Track Work), how the project works and why in the developer docs (Write Docs), proposing them when there are none. AGENTS.md, CLAUDE.md and other instruction files hold only rules for agents.

## Recover After Context Loss

When the conversation about the current work is no longer in your context (after compaction, a summary that replaces it, clear, a transfer into another context, or a session or branch that continues the work without it), pause task work and recover first, with only the reads recovery needs; recovery is not a bypass of authority, capabilities, or host permissions.

- Reload the methods the current work needs.
- When a Working Record exists or may exist for the current work, load Track Work and recover the record that belongs to that work in its order, starting from its `recover` view, not the raw file. A summary is not recovery. If recovery is incomplete, report that and stop affected work.
- Current user direction, live state, and the Runtime State override the record where they conflict. A record or summary may show prior approval; check that it still applies. Neither creates authority.

Then continue the covered work toward the agreed end. Context loss is no reason to stop or ask again. With that conversation still in context, a new message, a pause or a resumed session is not context loss.
