---
name: tool-execution
description: "Use for Freeflow programs, mutations, exact artifact recovery, and unfamiliar catalog operations; bounded direct read/search needs no skill solely for one call."
---

# Tool Execution

Use Freeflow's bounded tools when they fit the work, without replacing native tools or gaining authority from a visible operation. The latest Runtime State and actual admission decide availability. This method applies to programs, mutations, exact recovery and unfamiliar catalog operations; a single bounded direct read or search can proceed from its own schema without loading this body.

## Choose The Surface

One known focused read or search belongs in `freeflow_read` or `freeflow_search`. Batch known line ranges; use path discovery before contents, `count` before materializing hits, `matches` before `context`, and exact ranges only when the decision needs them. Limited coverage, skipped files, unavailable backends and missing continuations do not prove absence. Do not discover a direct operation already described by its tool schema.

Use `freeflow_tools` search/describe for an unfamiliar operation or missing exact contract, then call its registered revision. Use `freeflow_run` when several next steps are already determined and bounded values can be filtered locally; one simple call does not need a program. Read [Programs and exact contracts](references/programs.md) before writing a program, and load the [generated core bindings](references/generated-program-bindings.md) for each core operation it declares. For a long-tail operation, use its complete `freeflow_tools.describe` binding; an unavailable binding is not a declaration.

## Keep The Boundaries

Canonical child values stay in the restricted guest/host exchange; only explicit `emit` enters the program's outer model result. A model view may omit canonical data. Read [effects and recovery](references/effects-and-recovery.md) before applying a patch, recovering exact output, or handling a failed/unknown effect. A captured artifact describes bytes at its stated observation boundary, not today's external state.

A program is not a transaction. Do not rerun a completed or unknown mutation merely because its model view, artifact or program failed. Stop for approval, changed instructions, an unresolved effect, or a semantic choice the program cannot make mechanically. Return the observed status, coverage and missing evidence rather than manufacture completion. Tool visibility, this skill, and stored artifacts never grant permission to act.
