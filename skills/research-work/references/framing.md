# Framing

This reference is judgment: adapt it to the question. The Rules it relies on are in [Research Work](../SKILL.md).

Goal: a brief that someone else could carry out and recognize as done, agreed with the user before any source is read.

## Make The Question Answerable

A question is ready when a person who did not write it could say what would answer it. Test it before writing the brief:

- **One sentence, no jargon.** If it needs a paragraph, it is several questions; ask the user which comes first.
- **The swap test.** Replace the subject's name with a different one ("how does Codex dispatch tool calls" → "how does Aider dispatch tool calls"). If the question still reads the same and nothing in it says what to look for, it names a topic, not a question. Add what is to be found out: a mechanism, a quantity, a difference, a cause.
- **Done is visible.** Say what the answer will contain: the path a request takes through the code, a table of options with what each costs, the rate with its interval. A report on "everything about X" never finishes.
- **The words mean one thing.** Define any term the answer turns on ("tool call", "turn", "context window") in the brief, in the user's sense.

When the user asks for a topic ("research the Codex harness"), propose two or three concrete questions it could mean, with what each answer would let them do, and let them choose. Never write the user's question for them without asking.

## Who Uses The Answer

Write down who reads the result and what they will decide or do with it. This sets everything after it: which sources matter, how deep to read, which rigor, what to leave out. A finding that changes no decision the reader faces is context, not a finding.

Ask what changes under each likely answer. If every answer leads to the same action, the question is not worth the research; say so.

## Claim Sought Or Descriptive

- **A claim:** the work should let you say something that could turn out false ("the harness retries a failed tool call at most twice", "approach A needs fewer tokens than B on these tasks"). Write the claim and what would show it wrong.
- **Descriptive:** the work maps how something is, with no claim to test ("how the harness assembles its prompt"). Write `none: a descriptive report` for the claim and the prediction, and make the scope do the work instead.

A descriptive report can still contain claims; each goes in the register with its level.

## Claims That Something Is New

"Nobody has done X", "this is the first", "no tool does Y" are claims about absence, and absence is only as good as the search behind it. Bind every such claim to its search: the databases or sources, the queries, the date, logged in the search ledger. Write it as "within these searches, we found none", not as a fact about the world. A keyword search that finds no match does not show novelty: rephrase, search for the mechanism rather than the name, and look at what cites the closest work before saying none exists.

## Prediction

For a claim, write what you expect before reading, and the result that would count as failure. It is cheap and it protects the conclusion: an expectation written down can be wrong, and a wrong one is information. An expectation formed after reading fits whatever was read.

## Scope

List what is in and what is out, in plain terms (`- In: the agent loop and tool dispatch`, `- Out: the model provider clients`). For code, name the repository and the commit. For literature, name the period and the kinds of source. What is out is not a limitation to apologize for later; it is the boundary the user agreed to.

## Constraints

Write each constraint the user gave in their own words, with the date: "cite every claim to a file and line", "no paid APIs", "finish by Friday". Constraints stated once in conversation are lost by the next context unless they are in the brief.

## Rigor

Propose a rigor level with the reason, and let the user choose:

- **check** when the answer feeds one reversible choice and a wrong answer is cheap to notice;
- **study** when someone will build on the answer or repeat it to others;
- **publication** when it will be published, cited, or used to decide something hard to reverse.

When unsure between two, propose the lower one and say what would raise it. Overdoing costs as much as underdoing: a check run at publication rigor spends the user's time on ledgers nobody reads.

## Agree It

Send the brief to the user through Discuss Work's agreement, with your defaults marked, and wait. Record the agreed brief's status as `Accepted` with its Source naming the user's reply. A change to the question later is a new agreement, not an edit you make on your own; record the old and new question in the brief's Constraints or a note, so the report can say which question it answers.
