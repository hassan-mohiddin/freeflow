# Portable Execution

Use one case fingerprint, one Pi-first executor, one evidence bundle, and fixed graders. Keep the concrete Pi boundary limited to capability probes, invocation construction, event parsing, usage extraction, and cleanup. Add another host only when a real supported host exists.

## Capability Rule

Choose the cheapest mode that preserves the eval question. If a fallback changes the question or evidence quality:

- mark it Diagnostic, Reduced-Fidelity, or Unsupported;
- name the missing capability;
- stop when acceptance requires it.

## Subject Isolation

For each run:

- copy only the fixture into an isolated temporary root;
- copy only the variant's declared immutable subject resources separately;
- for composition, materialize each named base/target skill and runtime resource separately, preserve order, and fingerprint every declared byte;
- keep cases, assertions, reports, controls, and labels coordinator-side;
- allow reads only from fixture and snapshot;
- allow writes only inside fixture;
- reject traversal and symlink escapes;
- expose no unrestricted shell;
- verify the snapshot hash after execution.

Directory placement alone is not isolation. If the adapter cannot enforce every exposed tool, do not claim strict isolation.

## Pi Bootstrap

Use one-shot JSON, no session, no context files, no auto-discovered resources, one explicit root guard, explicit skill snapshots, minimal tools, and an isolated config home. For declared composition, use repeated explicit skill paths plus the exact evaluator-owned kernel/Workflow runtime extension; never load the installed Freeflow package. Use Pi RPC only for true fixed multi-turn evidence, currently two to four scripted user turns.
