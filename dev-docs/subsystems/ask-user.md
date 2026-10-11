# Ask User And The Inbound Channel

> **Covers:** `pi-extension/src/ask-user/`, `pi-extension/src/host/inbound.ts`, `skills/workflow/references/asking-the-user.md`
> **Tests:** `pi-extension/tests/ask-user/`, `pi-extension/tests/host/inbound.test.js`
> **Verified at:** `9180dd61` (2026-10-11)

For contributors changing how Freeflow on Pi asks the user a question, or how content from outside the turn reaches the model. Design and decisions: Task 002's spec (`.freeflow/tasks/task-002-*/specs/ask-user-monitor-messaging.md`, local to the developer's checkout).

## Purpose

**`ask_user`** lets the agent put a choice that is the user's to a dialog mid-turn and continue on the answer, instead of asking in its reply and ending the turn. Any activity that needs the user's choice uses it: scope beyond what was authorized, a blocking decision (Decision Gate), a direction once discussion narrows (Discuss), a route for finishing a branch. Each activity keeps its own judgment about what to ask; the tool changes how.

**The inbound channel** is one delivery rule for content arriving from outside the turn. Background command exits, monitor events and messages from other sessions ([Messaging](messaging.md)) are its sources.

It deliberately does not:

- decide when to ask: the Interaction Contract, Workflow and the asking skills do;
- time out: a question waits for the user (Task 002 D-001), since an automatic answer would decide something the user owns;
- let a Cognitive Routing worker ask: under automatic routing the Coordinator talks to the user, and a worker returns the choice in its report.

## How It Works

**Shape.** Claude Code's `AskUserQuestion` shape, since models know it: 1–4 questions, each with a full-sentence question, a header of at most 12 characters, and 2–4 options with a label and a description; `multiSelect`; the recommended option first. `validateQuestions()` enforces the counts, unique headers and labels, and refuses an option named "Other" (the dialog adds the user's own answer itself).

**Asking by mode** (`askUser()` in `ask.ts`):

- the terminal (`ctx.mode === "tui"`): one `QuestionForm` (`form.ts`) through `ctx.ui.custom`. A single question answers on Enter; several are tabs with a Submit tab. Each question lists its options with descriptions, then "Type my own answer"; Space toggles a multi-select option; `n` adds a note; Esc closes the dialog unanswered. The form is adapted from Pi's `examples/extensions/questionnaire.ts` and uses Pi's `Input` for text.
- RPC and other UIs: one `ctx.ui.select` per question, each option shown as `label — description` (Pi's `select` has no per-option description), then `ctx.ui.input` for the user's own answer; multi-select repeats `select` until the user picks Done.
- no UI (print, JSON): unavailable.

Closing any dialog dismisses the whole question.

**Result.** `outcomeText()` gives the model each question with the chosen labels or the user's words and any note, then: each answer decides only its question, and a note that asks or sets a condition is not a decision. A dismissed or unavailable question is an error result telling the agent to ask in its reply and not act on the choice. `details.outcome` carries the structured answers for the transcript.

**Rows.** The call row reads `Question · header: question`, with the options when expanded; the result row `Answered · header: answer (note: ...)`, the user's own words in quotes, or `Closed without answering (Esc)`. Several questions list one line each. Rows use `foldRow()` (`host/rows.ts`): a short body shows in both views, a long one only when expanded, as Pi's own rows.

**Deadline.** `FormOptions.deadline` adds a countdown line and closes the form unanswered when it passes (`askUser()` ticks it each second); `confirmWithUser()` takes `timeoutMs` and its own Yes and No labels, and passes the timeout to Pi's `confirm` outside the terminal. Messaging's held messages use it with Deliver and Refuse.

**Availability.** The `askUser` entry in the capability state (`host/config.ts`) is effective whenever Freeflow is enabled, and disabled inside subagents with the other optional capabilities. `applyAskUserTool()` declares or withdraws the tool in `status()`. The tool is `model-only`, as task memory's is: it asks the user, so scripts must not call it, and called directly its transcript rows apply.

**Routing refusal.** The tool's host checks `routing.observationScope()`: under automatic control, a Helper or Executor gets a refusal telling it to put the choice in its report.

**Guidance in three layers:**

1. The tool description (shape and mechanics) and one `promptGuidelines` line, which Pi adds to the system prompt's rules while the tool is active. Tool Execution's rules rewrite (`tool-execution/prompt.ts`) removes only three of Pi's generic lines, so the guideline survives.
2. One host-neutral bullet in `runtime/prompts/interaction-contract.md`: a question tool usually fits a bounded choice that is the user's; ask in the reply when the choice needs explaining or is open. It reaches Claude Code and the other hook hosts too.
3. Workflow's reference `asking-the-user.md` with the full method, read "before asking the user for a choice that is theirs to make". Workflow, Decision Gate, Discuss and Finish Branch link it with that same condition.

**Task memory's confirmations** use `confirmWithUser()`: in the terminal a one-question `QuestionForm` with the options Yes and No and without an own-answer row or notes, elsewhere Pi's `confirm` as before.

**Inbound channel** (`Inbound` in `host/inbound.ts`). `deliver(notice)` sends a notice at once; with a batch key, notices for that key within the window (default 200 ms) join one notice, and a key past its per-minute limit is stopped once (`onLimit`) and sends nothing more until `close()`. The source chooses its key (one per monitor), window, limit and the text of a joined batch (`join`), calls `flush()` to deliver what is pending before it reports its own end, and calls `close()` when it ends; background exits use no key, since each command exits once. `reset()` at `session_shutdown` drops everything pending. Delivery is always a Freeflow custom message through `sendMessage` with `triggerTurn` and `deliverAs: "steer"`: while the agent works it arrives after the current tool batch, while idle it starts a turn. A notice that should not wake the agent is sent with `triggerTurn: false`. A run started this way would lose Freeflow's system sections (Pi #10267); `keepSections()` keeps them (see [System prompt architecture](prompt-assembly.md#pi)). `renderNotice()` draws a notice as one line naming its source; when its first line ends in a colon (a monitor's batch), the row adds the first line after it and a count of the rest.

## Decisions

| Decision | Reason | Rejected | Source |
| --- | --- | --- | --- |
| The question tool serves every place Freeflow needs the user's choice, not Decision Gate alone. | Authority, direction, finishing work and task memory all need the user's choice; tying the tool to one skill would hide it from the rest. | The tool as Decision Gate's mechanism. | User, 2026-10-11 (Task 002 D-002) |
| Guidance in three layers: tool description and prompt guideline, one Interaction Contract bullet, an on-demand Workflow reference. | The agent always knows the tool and when it fits, and reads the full method only when about to ask; the contract bullet also serves Claude Code's own question tool. | A capability skill; the full method in the system prompt. | User, 2026-10-11 (D-002) |
| No timeout. | An automatic answer decides something the user owns. | Claude Code's optional auto-continue. | D-001 |
| Workers do not ask under automatic routing. | The Coordinator owns the user interaction; Claude Code's subagents cannot ask either. | Any profile asking. | Task 002 spec §4.2 |
| Idle notices start the turn as a Freeflow custom message, not a user message. | A user message shows another session's or a command's words as the user's (the user's trial); `keepSections()` keeps Freeflow's sections on the run Pi starts (Pi #10267). | Starting idle turns as user messages (the earlier workaround for Pi #10267). | Task 002 D-008 |

## Intended Behavior That Looks Wrong

| Behavior | Why |
| --- | --- |
| Over RPC an option's description is part of its label (`label — description`). | Pi's `ctx.ui.select` takes plain strings; the dialog-level description is not reachable through it. |
| A dismissed question is an error result. | The agent must not continue as if the user had chosen. |
| The tool adds about 600 tokens to every request while Freeflow is enabled. | Its description and schema are part of the fixed tool list, written to the prompt cache once. |

## Tests

- `pi-extension/tests/ask-user/ask-user.test.js`: validation, result text, the terminal form's keys, the RPC path, confirmations, the worker refusal and the prompt guideline.
- `pi-extension/tests/ask-user/session.test.js`: a real Pi session: the tool declared with Freeflow, the guideline in the request, the answer as the tool result, the prompt prefix held across requests.
- `pi-extension/tests/host/inbound.test.js`: delivery while busy and idle, batching, limits and the notice row.

## Related

[Tool Execution](tool-execution.md) (background commands, the channel's first source), [Task Memory](task-memory.md) (its confirmations), [Prompt assembly](prompt-assembly.md).
