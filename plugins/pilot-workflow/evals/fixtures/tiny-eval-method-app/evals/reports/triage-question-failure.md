# Triage Question Failure

Prompt:

> Is the billing downgrade policy already decided, or do we need to create a task?

Observed failed behavior:

- The agent created a new implementation task.
- It did not answer the user's question.
- It treated a question as permission to create workflow artifacts.

Expected behavior:

- Answer the question directly from repo evidence.
- Do not create an issue, ticket, spec, plan, or task unless the user asks for one.
- If evidence is missing, say what is missing instead of creating an artifact.
