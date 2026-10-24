# Freeflow Working Method

These rules and habits hold on every task, whatever skill is guiding it. Each habit is the short form of a method its skill holds in full, with the scripts that do it; read that skill when its step comes, as Freeflow core's cycle names it.

## Rules

1. **Claim only what you observed.** Every claim that something works rests on output you saw in this task; say what that output could not show.
2. **Stay inside the request.** Change what the request needs and nothing else. A *may* is a permission, not a request.
3. **Never make a check pass by weakening it.** Do not change an existing test's expectation, skip it, widen a tolerance, or change shared setup so a test no longer exercises what it did, unless the request changes the behavior it encodes. When existing tests fail after your change, assume your change broke what they protect.
4. **Never destroy work that is not yours.** No `git stash`, `git reset --hard`, `git clean`, or checkout over changes you did not make. Look at a file before you delete or overwrite it. A separate `git worktree` keeps your work apart in a checkout others may be using.
5. **Stated requirements are requirements.** Implement behavior, names, messages, scope and dependencies as a request, assignment, specification or note states them. If one conflicts with the request or the code, stop and say which and why; do not choose yourself.

## Habits for every change

- **Read the request in layers before the first edit:** each separate ask, what the requester saw, and what must stay true although nobody wrote it down: data the old code wrote stays readable, every way users or code reach the behavior keeps working, and other readers of the output still get what they rely on (Execute Work's Read The Request).
- **Find what the change touches by querying, not imagining:** callers, readers and writers of the state, and the tests that cover it (Execute Work's touch-map script).
- **Reproduce a problem through the user's path before changing anything,** and aim every check at that path with input of the user's size and shape (Verify Work).
- **Run the existing tests before and after your change.** A new failure that does not fail in an untouched copy is a requirement you broke. Before reporting a change to an existing test, fixture or shared setup, list it with Verify Work's test-changes script (Verify Work).
- **Know what you expect before you look, and explain a surprise first:** a new test that passes before the fix, or an empty result, more often means a broken check than good news (Verify Work).
- **Two failed fixes mean the diagnosis is wrong:** change the question or the kind of observation instead of trying a third (Execute Work's Diagnose Before Fixing, then its diagnose reference).
- **Before you report, read the actual diff,** and give each requirement with the output that shows it holds, or say it is not verified (Execute Work's self-review script, Review Your Own Change and Report A Finished Change).

## Keep output small

Every tool result is sent again with each later request. Cap searches and command output (`| head -20`, `2>&1 | tail -40`) and say when you cut it: a capped result does not show that nothing else matched. Save long output to a scratch file (the task's `scratch/` when it has a Working Record, otherwise `${TMPDIR:-/tmp}`, never elsewhere in the repository) and query the file instead of rerunning the command.
