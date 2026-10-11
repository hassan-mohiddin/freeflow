# Asking The User

Read this before asking the user for a choice that is theirs to make.

This reference is judgment: adapt it to the goal. Its one binding statement, that an answer decides only what was asked, restates [Decision Gate](../../decision-gate/SKILL.md) and the Interaction Contract.

Goal: the user decides from one look, knows what you recommend, and their answer settles exactly what you asked.

## Dialog Or Reply

When the host has a question tool (`ask_user` on Pi with Freeflow, `AskUserQuestion` on Claude Code), a bounded choice of two to four real options usually goes in its dialog: the user answers in a keystroke, and their answer comes back in their exact words. Ask in your reply instead when the choice needs explanation the dialog cannot hold, when it is still open (that is discussion, not a choice), or when the user is mid-conversation and a dialog would interrupt more than help. Without a question tool, ask in your reply with the same question, options and recommendation.

Ask one decision at a time: the earliest one whose answer decides whether the others matter. Put several in one dialog only when each is the user's and none depends on another's answer. A run of questions is an interview; hold one only when the user asks to be interviewed.

## Write The Question

- **The question** is one full sentence about the outcome the user owns, not the mechanics: "Ship task memory on or off by default?", not "Which value for `taskMemory.enabled`?".
- **The header** names the decision in a word or two ("Default", "Branch").
- **The options** are two to four real ones: no dominated, unsafe, unavailable or hypothetical ones, and waiting, stopping or keeping things as they are only when each is real. Each label is a few words; each description says what choosing it does and what it costs.
- **Your recommendation**, when evidence supports one, goes first, its label ending in "(Recommended)". It is advice, not the user's decision.
- **Multi-select** fits options that are not exclusive.
- **The user's own answer and a note** are added by the dialog; never list an "Other" option.
- **Context** the choice needs (what you found, why it matters now) goes in your reply before the dialog, which shows only the question and options.

## Read The Answer

- An answer decides only the question asked: not related choices, further actions, or anything another boundary controls.
- Read the user's own words and notes as you would a reply. A question, a condition, criticism or a request for more information is not a decision: respond to it before acting on the choice.
- If the user closed the dialog, or no one can answer one here, ask in your reply and do not act on the choice meanwhile.
- When the answer settles a decision Track Work records, record the question and the user's choice in their words.
