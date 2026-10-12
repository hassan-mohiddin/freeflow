# Eval Definition Review

Read this before reviewing a case, suite, fixture, grader, or rubric that will be run to measure behavior, and before spending on its runs.

This reference is judgment; Review Work's Rules still bind.

## Establish The Claim It Will Measure

Goal: review the definition against the comparison it is meant to support.

Identify the behavior and boundary under test, the arms and the one component meant to differ between them, the model and settings, the subject's prompt and visible files, every expectation and review question, and the evidence behind each seeded or real defect. Run the evaluator's loader first; a definition that does not load needs no model review.

## Check That It Can Measure What It Claims

Goal: a correct subject passes, a wrong one fails, and the result means what its name says.

- **A correct answer can pass:** for each expectation, write or imagine the answer a sound subject would give and check that it passes. Text checks fail correct answers when they require one exact phrase, such as a function name, where a correct answer may quote the line or describe it instead.
- **A wrong answer cannot pass:** an expectation that holds for an empty, generic, or opposite answer measures nothing. Nor can a shortcut: editing the tests, hard-coding the expected output, or text addressed to a judge.
- **The outcome, not the path:** checks grade what the subject produced; a required order of tool calls fails valid approaches. A tool-call check is right only when the call itself is the behavior.
- **Both sides are tested:** cases where the behavior should occur sit beside cases where it should not, and a coding task's graders cover the new behavior and the existing behavior it must not break.
- **Names match checks:** each expectation's name and comparison say what it actually tests.
- **Defects are real and present:** each seeded defect is shown by a check that fails with it and passes without it, or by a direct contradiction of a stated requirement. The case author is not the model being measured.
- **Clean is clean:** a clean variant taken from history may hold a defect found later. Check it against its own requirements before trusting a clean-variant fail; a variant with a known defect is real, not clean, and is scored as such.
- **No leaks:** nothing the subject can see, including group IDs, paths, file names, and fixture comments, hints at the defect or the expected answer. Rubric references and grader files lie outside the fixture and the subject's declared context.
- **Arms differ only as declared:** sources, models, settings, tools, and context match except for the component under test, and each is pinned.
- **The decision comes first:** when the result will claim one arm is better, the decision rule (measure, arms, direction, size) is declared before any run.
- **The task is solvable:** a coding task's reference solution passes its graders (`check-tasks`), so a failure measures the subject, not the task.
- **Participants see only what they declare:** each pipeline stage's inputs and a simulated user's card hold what that participant should know and nothing that hints at the answer.
- **A shell is confined:** a subject gets a shell only behind a declared isolation that the evaluator verifies, never the host's own.
- **Judges see enough:** a grader or advisory reviewer receives the full output it judges and the material the question is about; answers given over truncated or missing evidence are not results.

## Classify What You Find

A check that a correct answer fails, a defect not shown present, a clean variant with a known defect, a leak, an unsolvable task, or a comparison claim with no decision rule declared is Blocking for spending on runs, because the result would be wrong whatever the subject does. Gaps in coverage beyond the claim are Improvements unless the claim depends on them.

## Where Revisions Go

Revise the definition before running it. After a run, a fault found in a definition is recorded with the results it affected, and those results are read with it; do not quietly rescore them.
