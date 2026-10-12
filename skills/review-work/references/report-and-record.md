# Report And Record Review

Read this before reviewing an account of work already done: a final report to the user, a status or results note, or a Working Record.

This reference is judgment; Review Work's Rules still bind.

## Establish The Account And What It Describes

Goal: compare the account with what happened, not with how the author remembers it.

Identify the account's exact state and reader, and the moment it serves: handing work back to the user, recovering after context loss, or handing over to another agent. Gather what it describes: the commands run and their output, changed files and commits, run results, messages sent, and the requests and decisions it cites. Read the Working Record through [Track Work](../../../skills/track-work/SKILL.md) before reviewing one.

An account is only as good as the evidence it rests on, so read that evidence directly. A claim that matches the author's earlier summary but not the output it summarizes is wrong.

## Check Each Claim Against What Happened

Goal: every claim the reader may act on is true and no stronger than its evidence.

- **Fidelity:** each statement of what was done, found, or decided matches the actions and outputs it describes. Recompute counts, totals, and costs from the source instead of trusting the stated figure.
- **Pointers:** each commit, file, run ID, path, or link resolves, and what it shows is what the claim says.
- **Strength:** "verified" names a check that ran on the current state; "done" is not stated for work that was drafted, partly run, or run against an earlier state. A passing subset is not "tests pass".
- **Unfinished work:** skipped steps, failures, workarounds, and open questions are stated where the reader will see them, not left for the reader to infer from silence.
- **Attribution:** the user's words and decisions are quoted or cited as theirs; the author's inferences are labelled as inferences.

For a Working Record, also judge it by its job: accurate current task memory, recoverable decisions and work, evidence limits, a provisional remaining route, defining artifacts and Recovery sources sufficient for a fresh context to resume, and one next useful action.

## Classify What You Find

A wrong figure, a pointer that does not resolve, or a claim stronger than its evidence is an Issue when the reader could act on it: Blocking when acting on it would mislead the user or a resuming agent, Non-blocking when the error cannot change what they do. Wording and presentation preferences are not Issues.

## Where Corrections Go

The author corrects the account; a Working Record is revised through Track Work. When a claim turns out unsupported, correct the claim or gather the missing evidence through [Verify Work](../../../skills/verify-work/SKILL.md); never adjust the evidence to match the claim.
