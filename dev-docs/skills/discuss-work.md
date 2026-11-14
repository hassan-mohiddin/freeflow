# Discuss Work

> **Covers:** `skills/discuss-work/`
> **Tests:** `.skill-eval/discuss-work/tests/`
> **Verified at:** `ecfd0788` (2026-11-10)

For anyone changing Discuss Work: what it is meant to change, why it is shaped the way it is, and what the evidence shows. The method itself is in [the skill](../../skills/discuss-work/SKILL.md).

## Purpose

Discuss Work settles with the user what to do and how, before anything is built, and keeps the user's choices in one decision list. Its reader is the agent in conversation with the user, from a session's first message on. Most sessions are long-horizon work, so the skill is read at the start of each session and kept in context, not read again on every turn.

## Behavioral Claim

- **Behavior it produces:** a session's first message is answered first, whatever it is; a question, an idea, criticism or a status check gets its answer and changes nothing else, with no agreement and no record update; work that builds or changes behavior is agreed in one reply before the first edit; a stop or a limit from the user is recorded at once; any other change to agreed work is recorded in one step when it settles, through Track Work; a steer while work or workers run is sorted (a question, a new decision, a change to an agreed decision, new scope), and only a change to an agreed decision gets a reply before it applies: its consequence.
- **Failure it prevents:** an agent that starts building, or writes a record, from the first sentence of a discussion that has not settled; a record that holds undecided understanding as if it were agreed; and a coordinator that applies every steer as given, so scope grows and running workers build on a decision that changed.
- **Earliest decision:** a session's first message, before the first reply.
- **Nearby cases it leaves alone:** a question, an idea, criticism or a status check, which needs no agreement; a built and agreed change, which is Execute Work's; the record's own format, which is Track Work's.
- **When it stops steering:** once the work is agreed and under way, the agreement governs; When The User Returns Mid-Work applies again when the user comes back or steers.

## Design

- **Answer first, then agree** (discussion block B-024, 2026-11-10). The user's first prompt may be a question or a direct order, and the reply answers it before anything is recorded. Discussion before a build is inevitable; what matters is that it ends in one agreement, not in records written as the conversation goes.
- **One write when something settles.** A stop or a limit is recorded at once, because a later context must see it. What happened is recorded when it happens, because it cannot be worked out again. Understanding is recorded at the checkpoint, because it keeps moving until then (B-024, the moments at which something is written). Track Work's Decide What To Track holds the table.
- **The agreement holds terms only.** Its lines are what the agent may do, what it may not, where it stops and where it comes back. A message that changes none of them is discussion. This keeps the agreement short enough to read without replaying it.
- **The wording avoids "every message".** Reading the skill once at the start keeps it in context for the rest of the session; a line that says "every message" would invite a re-read on each turn (B-024).

- **Steer intake merged into When The User Returns Mid-Work** (the map's "Delegation as one system (13 Nov)", Three additions, 1; decided by the owner 2026-11-14, D-057). One section for the top position, the agent that talks to the user, rather than a second section beside it: both start from the same moment, the user speaking while agreed work runs, and #165's answer-first rule opens it. The steer is sorted into four kinds; only a change to an agreed decision gets a reply before it applies, and that reply is the consequence (the work it throws away, what else it changes), never "why?", and the change is made in the same reply, with no wait for a further yes: the user already said it, and the reply is where they see its cost (R15, N3). The observation behind it: Opus 5.5 takes a steer as right and applies every piece of feedback, so scope grows under repeated steering (the map's "What the models are like"). New scope is a new part with its own brief, so each running worker's brief stays one clean request; the agreement gets an update, or a new agreement when the outcome differs (R15, N2). The running workers a change touches are found by `delegate status --cites`, from the decisions their briefs cite under Settled; what is done with them (amend and tell, stop, or a quiet refinement) is Execute Work's Work While Workers Run, to which the bullet only points, since a return reaches a parent there too; a first version restated it and dropped "tell the worker" (R15, N1).
- **The agreement shows `Workers:`** (the map's 13 Nov section; the script reads the line since PR #168). When workers above the cheap tier will do parts, the agreement names them (`choices.mjs agreement --workers`), so the user grants them in the same answer; the line sits before Size, which stays last.
- **A `changed` item carries its reason** (the map's one script check). It was a warning; it is an error now, so a decision that moved without a reason stops `validate` and `delegate close`.
- **The description gains the steer** ("when the user steers, changes a decision or adds scope while work or workers run"), so a coordinator that has lost the body after a compaction reads it again at a steer; every earlier trigger stays.

## Evidence

- `skill-author validate skills/discuss-work`: valid, with no findings (the description is 1,004 characters, within the 1,024 limit).
- `npm run test:discuss-work` covers the script the body names, `skills/discuss-work/scripts/choices.mjs`; the wording change itself is prose and has no script test.
- Trigger check (one request that should read the skill, one near miss that should not, on Haiku, two model calls at most): not run. The skill-eval runner executes its groups in a container, and this container's Docker daemon is not running (`docker info` fails), so the runner could not start. Its result is not claimed here.

## Rejected

- **Every change to the agreement recorded at once.** An agreement whose later lines undo its earlier ones has to be replayed to learn what holds, and a message that changes no term (an opinion, an idea, a correction) would look like a change of terms (B-024; Track Work's Keep The Agreement).
- **Discuss Work read only at a task's first request.** A session's first message may be a question with no task at all, and the answer must come first whatever it is (B-024).

- **A separate steer section beside When The User Returns Mid-Work:** two sections for one moment would each hold half of what the agent does there.
- **Asking "why?" before applying a changed decision:** the user owns the decision; the agent owes them the consequence, not a challenge.

## Open Questions

- Whether a first message that is a plain question reads the skill, and whether a near miss does not: the trigger check measures this on Haiku.
- Untested: whether a steer while workers run reads the skill through the description's new clause and the Routes row (R15, E1): a trigger check with one steer that should read it and one near miss that should not; not run, since no evals run until the owner says.
- Untested: whether stating a steer's consequence changes what Opus 5.5 does on top, and whether coordinators tell workers of a changed decision. If the ledger shows they forget, the delegation gate could warn a worker whose brief cites a changed decision (the map, not built).
