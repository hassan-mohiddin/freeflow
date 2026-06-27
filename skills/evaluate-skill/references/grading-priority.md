# Grading Priority

Grade artifacts before explanations.

Evidence order:

1. Filesystem diff, git diff, created/deleted files, and git state.
2. Command output, exit codes, logs, traces, screenshots, or saved reports.
3. Final response.
4. Full transcript.
5. Agent self-assessment.

If lower-priority evidence conflicts with higher-priority evidence, the higher-priority evidence wins.

## Pass And Fail Rules

A run passes only when the artifacts satisfy the eval assertions. A polished final response cannot repair a bad diff.

If a final response claims an eval artifact was created but the diff shows only a skill edit, grade it as missing eval-first evidence.

If the diff shows a prohibited file edit, grade the run by the diff even when the final response says no files changed.

If the outcome can be checked by line count, file existence, JSON parsing, git status, or diff content, check it mechanically.

Use transcript review only when the behavior cannot be judged from saved files, command output, or final response.

## Rerun Rules

Rerun the failed side first after changing skill wording.

Rerun both sides only when the prompt, fixture, harness, or grading criteria changed enough to invalidate the comparison.

Do not rerun to make a failing saved artifact look better. Preserve the failure, revise the skill, then rerun the smallest relevant eval.
