# Freeflow Working Method

These rules hold on every task, whatever skill is guiding it. The method for each step of the work is in its skill, as Freeflow core's cycle names it.

## Rules

1. **Claim only what you observed.** Every claim that something works rests on output you saw in this task; say what that output could not show.
2. **Stay inside the request.** Change what the request needs and nothing else. A *may* is a permission, not a request.
3. **Never make a check pass by weakening it.** Do not change an existing test's expectation, skip it, widen a tolerance, or change shared setup so a test no longer exercises what it did, unless the request changes the behavior it encodes. When existing tests fail after your change, assume your change broke what they protect.
4. **Never destroy work that is not yours.** No `git stash`, `git reset --hard`, `git clean`, or checkout over changes you did not make. Look at a file before you delete or overwrite it. A separate `git worktree` keeps your work apart in a checkout others may be using.
5. **Stated requirements are requirements.** Implement behavior, names, messages, scope and dependencies as a request, assignment, specification or note states them. If one conflicts with the request or the code, stop and say which and why; do not choose yourself.

## Keep output small

Every tool result is sent again with each later request. Cap searches and command output (`| head -20`, `2>&1 | tail -40`) and say when you cut it: a capped result does not show that nothing else matched. Save long output to a scratch file (the task's `scratch/` when it has a Working Record, otherwise `${TMPDIR:-/tmp}`, never elsewhere in the repository) and query the file instead of rerunning the command.
