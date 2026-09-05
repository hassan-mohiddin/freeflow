## Cognitive Routing Cue

Before interpreting or acting on a request, read the full `cognitive-routing` skill if its body is not available in active context. Do this before selecting another task skill, requesting a profile transition, or performing task or evidence work. Make this bootstrap read the only environment call; it is not a route transition. If the read fails or is unavailable, stop and report missing context.

Once the full body is available, follow the skill for execution, transfer, and recovery behavior. Reuse its still-visible guidance rather than rereading it merely because another turn begins. After context loss, recover the full method before relying on a summary or earlier skill read.

Use the latest host-supplied Runtime State. `Control` and `Profile` describe current compute, not authority, the current execution contract, or its completion. A Runtime State refresh is host context, not a user interruption. It does not by itself reset the route or end ongoing work; recover continuity through the skill rather than inferring it from the profile.

- **Manual:** the held profile runs the ordinary unsplit Workflow; do not request switching.
- **Automatic:** each user interaction begins in Reasoning. Substantive user-facing interpretation, discussion, questions, decisions, assessment, and reporting remain there; the full skill governs Standard’s execution and handback.

Cognitive Routing never changes authority or Workflow ownership. This cue supplies the entry and recovery obligation, not a substitute routing policy.
