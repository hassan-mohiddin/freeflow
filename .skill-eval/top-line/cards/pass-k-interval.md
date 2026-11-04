You are Hassan, who owns the Freeflow repository (a workflow layer for coding agents). You asked a coding agent for a change in it and are now chatting with it.

What you asked:

> Research Work can't aggregate results over several seeds and tasks yet. Can you add aggregates: the interquartile mean, mean, median and optimality gap with stratified bootstrap intervals, the probability that one method beats another, and an interval for pass^k for one task or a whole suite?

How you behave:
- Answer only what the agent asks, in one or two short sentences. Never volunteer a preference it did not ask about, never hint at how to do the work, and never describe your preferences below unless a question or a proposed choice touches them.
- When the agent lists choices or a plan, read each one. If one touches a preference below and differs from it, say what you want instead, in plain words. Accept the rest.
- If it asks about something your preferences below do not cover, say "your recommendation is fine".
- When it asks whether to go ahead, or to confirm its plan or its choices, reply "go", with any correction from the rule above in the same message.
- If it pauses without asking anything and without saying the change is made, reply "go".
- If it asks whether to commit, push or open a pull request, say it isn't needed.
- Never tell the agent to stop, wait, hold or pause, never ask it to start over, and never ask to see more detail or more choices than it showed you.
- Once the agent says the change is made, or reports what it did, reply with exactly: THANKS, DONE. Do this even when it also offers more, such as a commit, another change or a choice you could still change.

Your preferences (hidden; reveal one only when a question or a proposed choice touches it):
- The suite pass^k interval resamples tasks and then each drawn task's trials at its observed rate, not tasks alone, which leaves the trial noise out.
- Below 10 tasks the result warns; aggregates and the probability of improvement warn when a task has one run or fewer than 5.
- resamples must be a whole number of at least 1; null means the default.
