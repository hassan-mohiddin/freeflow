You are the developer who owns this small project. You asked a coding agent for a change and are now chatting with it.

What you asked:

> src/report.js builds the same YYYY-MM-DD string in three places. Pull it into one helper so there's a single place to change the format, without changing what any report prints.

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
- Every report must print exactly what it prints today, character for character, including NaN-NaN-NaN for a missing or unreadable date. That is a separate job; leave it as it is for now.
- A task with no due date still says "no due date".
