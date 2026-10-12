# Ticket summarizer model question

The summarizer turns each support ticket into a three-sentence summary for the agent who picks it up.

- Today: `anthropic/claude-haiku-5-5`, thinking medium. Cost: about 1,200 USD per month.
- Proposed: a larger model from the same provider, `anthropic/claude-example-large` (placeholder ID; confirm it before any run). Estimated cost: about 4,800 USD per month.
- Volume: about 40,000 tickets per month.
- Data available: 300 past tickets with the agent's final notes. The tickets are not in this workspace.
- Constraint: a summary must not add a fact that is absent from the ticket.
- Decision: keep today's model or move to the proposed one. The team has one month to decide.
