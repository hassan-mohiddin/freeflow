# Portable Execution

Use a host-neutral case, fingerprint, scheduler, evidence bundle, and grader. Keep adapters limited to capability probes, invocation construction, event parsing, usage extraction, and cleanup.

## Capability Rule

Choose the cheapest mode that preserves the eval question. If a fallback changes the question or evidence quality:

- mark it Diagnostic, Reduced-Fidelity, or Unsupported;
- name the missing capability;
- stop when acceptance requires it.

## Subject Isolation

For each run:

- copy only the fixture into an isolated temporary root;
- copy one immutable skill snapshot separately;
- keep cases, assertions, reports, controls, and labels coordinator-side;
- allow reads only from fixture and snapshot;
- allow writes only inside fixture;
- reject traversal and symlink escapes;
- expose no unrestricted shell;
- verify the snapshot hash after execution.

Directory placement alone is not isolation. If the adapter cannot enforce every exposed tool, do not claim strict isolation.

## Pi Bootstrap

Use one-shot JSON, no session, no context files, no auto-discovered resources, one explicit root guard, explicit skill snapshot, minimal tools, and an isolated config home. Use Pi RPC only for true multi-turn evidence.
