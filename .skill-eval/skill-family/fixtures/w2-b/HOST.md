# How this host loads guidance

- `AGENTS.md` at the repository root is loaded at the start of every session.
- At session start the host lists every installed skill with its name and description. The agent can select a skill from that list when the request matches its description.
- A user can also type `/invoice-check`. That loads the skill body directly, without the list.
- Files that a skill links to are loaded only when the agent opens them.
