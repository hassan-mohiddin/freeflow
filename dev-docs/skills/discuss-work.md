# Discuss Work

> **Covers:** `skills/discuss-work/`
> **Tests:** `.skill-eval/discuss-work/tests/`
> **Verified at:** `b5efd624` (2026-11-10)

For anyone changing Discuss Work: what it is meant to change, why it is shaped the way it is, and what the evidence shows. The method itself is in [the skill](../../skills/discuss-work/SKILL.md).

## Purpose

Discuss Work settles with the user what to do and how, before anything is built, and keeps the user's choices in one decision list. Its reader is the agent in conversation with the user, from a session's first message on. Most sessions are long-horizon work, so the skill is read at the start of each session and kept in context, not read again on every turn.

## Behavioral Claim

- **Behavior it produces:** a session's first message is answered first, whatever it is; a question, an idea, criticism or a status check gets its answer and changes nothing else, with no agreement and no record update; work that builds or changes behavior is agreed in one reply before the first edit; a stop or a limit from the user is recorded at once; any other change to agreed work is recorded in one step when it settles, through Track Work.
- **Failure it prevents:** an agent that starts building, or writes a record, from the first sentence of a discussion that has not settled; and a record that holds undecided understanding as if it were agreed.
- **Earliest decision:** a session's first message, before the first reply.
- **Nearby cases it leaves alone:** a question, an idea, criticism or a status check, which needs no agreement; a built and agreed change, which is Execute Work's; the record's own format, which is Track Work's.
- **When it stops steering:** once the work is agreed and under way, the agreement governs; When The User Returns Mid-Work applies again only when the user comes back with a change.

## Design

- **Answer first, then agree** (discussion block B-024, 2026-11-10). The user's first prompt may be a question or a direct order, and the reply answers it before anything is recorded. Discussion before a build is inevitable; what matters is that it ends in one agreement, not in records written as the conversation goes.
- **One write when something settles.** A stop or a limit is recorded at once, because a later context must see it. What happened is recorded when it happens, because it cannot be worked out again. Understanding is recorded at the checkpoint, because it keeps moving until then (B-024, the moments at which something is written). Track Work's Decide What To Track holds the table.
- **The agreement holds terms only.** Its lines are what the agent may do, what it may not, where it stops and where it comes back. A message that changes none of them is discussion. This keeps the agreement short enough to read without replaying it.
- **The wording avoids "every message".** Reading the skill once at the start keeps it in context for the rest of the session; a line that says "every message" would invite a re-read on each turn (B-024).

## Evidence

- `skill-author validate skills/discuss-work`: valid, with no findings (the description is 922 characters, within the 1,024 limit).
- `npm run test:discuss-work` covers the script the body names, `skills/discuss-work/scripts/choices.mjs`; the wording change itself is prose and has no script test.
- Trigger check (one request that should read the skill, one near miss that should not, on Haiku, two model calls at most): not run. The skill-eval runner executes its groups in a container, and this container's Docker daemon is not running (`docker info` fails), so the runner could not start. Its result is not claimed here.

## Rejected

- **Every change to the agreement recorded at once.** An agreement whose later lines undo its earlier ones has to be replayed to learn what holds, and a message that changes no term (an opinion, an idea, a correction) would look like a change of terms (B-024; Track Work's Keep The Agreement).
- **Discuss Work read only at a task's first request.** A session's first message may be a question with no task at all, and the answer must come first whatever it is (B-024).

## Open Questions

- Whether a first message that is a plain question reads the skill, and whether a near miss does not: the trigger check measures this on Haiku.
