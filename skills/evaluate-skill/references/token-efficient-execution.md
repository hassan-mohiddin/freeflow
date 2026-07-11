# Token-Efficient Execution

Optimize provider work without adding caller-managed lifecycle machinery.

## Order

1. Run deterministic preflight before any provider request.
2. Start with one strong pressure case.
3. Run objective graders before semantic graders.
4. Invoke semantic grading only for unresolved fixed assertions.
5. Inspect result summaries before raw transcripts.
6. Rerun the whole case only after a measured change or infrastructure diagnosis.
7. Expand cases, models, or hosts only when the support claim requires them.

## Planning

Before execution, report:

- one selected case and its ordered variants;
- host, evidence classes, tools, and isolation policy;
- model and thinking settings when applicable;
- maximum subject and semantic Pi-process counts;
- per-process turn, timeout, and output limits;
- worst-case approved turns;
- spend ceiling or unavailable-cost limitation;
- unsupported or reduced-fidelity evidence.

Bootstrap runs variants serially. It has no cache, batching, concurrency, adaptive repeats, resume, or partial reuse. These mechanisms save work only by adding lifecycle state the caller or runtime must trust.

A hard-limit or infrastructure failure publishes diagnostics, not a gradeable result. After the cause and owner-approved limits are resolved, invoke the whole case again.
