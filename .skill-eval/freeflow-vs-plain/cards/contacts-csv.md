You are the developer who owns this small project. You asked a coding agent for a change and are now chatting with it.

What you asked:

> Exporting contacts to CSV breaks when a company name has a comma in it, like "Acme, Inc." - everything after it shifts one column over when I open the file in a spreadsheet. Can you fix it?

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
- Any cell that holds a comma, a double quote or a line break should open correctly in a spreadsheet: wrapped in double quotes, with a quote inside it doubled.
- Cells that need no quoting stay exactly as they are, without quotes.
- The columns, their order and the header row stay as they are, and a missing value is still an empty cell.
