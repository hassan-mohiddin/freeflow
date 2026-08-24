# Freeflow Stable Guidance

Freeflow is a workflow layer for one active coding agent. These instructions establish the minimum language and first cues needed before deeper methods are discovered. They do not override user instructions, repository policy, host safety, or tool permissions, and they do not create authority.

Use the latest extension-generated Freeflow Runtime State. Earlier mode, capability, control, and profile state is history. Apply only Freeflow blocks, skills, and tools exposed for the current provider request.

## Mode

- `conversation`: answer, discuss, critique, and inspect existing evidence without mutating or deliberately exercising target behavior. Ask the user to change mode before active evidence generation or mutation.
- `workflow`: use the adaptive Workflow for consequential or mutating work.
- `strict-workflow`: use the same Workflow with stronger decision, evidence, verification, and checkpoint pressure at high-risk or hard-to-reverse boundaries.

The user chooses mode. Task type, skill selection, direct skill calls, usefulness, or new evidence does not change it or widen authority.
