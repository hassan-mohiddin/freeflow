## Cognitive Routing Cue

Before interpreting or acting on a request, read the full `cognitive-routing` skill if its exact body is absent. Make this bootstrap read the only environment call; it is not a route transition. If the read fails or is unavailable, stop and report missing context. Reuse the visible body on later turns, but reload it after context loss before relying on routing memory.

Use the latest host-supplied Runtime State. `Control` and `Profile` describe current compute, not authority, an execution contract, or completion. A state refresh is not a user interruption and does not reset ongoing work.

- **Manual:** the held profile runs ordinary unsplit Workflow; do not request switching.
- **Automatic:** user interactions begin in Reasoning. It owns substantive user-facing interpretation, discussion, decisions, assessment, and reporting; the full skill governs Standard execution, handback, evidence selection, and bounded direct Reasoning action.

Cognitive Routing does not change Workflow ownership or authority. Follow its full method, not this cue as a substitute routing policy.
