# Token-Efficient Execution

Optimize provider model requests, not merely wall-clock time.

## Order

1. Run structural checks without a model.
2. Start with one strong pressure case.
3. Reuse a matching control fingerprint.
4. Run objective graders before semantic graders.
5. Inspect final output and diff before full transcripts.
6. Rerun the failed candidate side first.
7. Add repeats only for conflict, unstable activation, or required variance evidence.
8. Expand hosts and models only when support claims require them.

## Planning

Before execution, print:

- selected cases and variants;
- host/mode and evidence class;
- model, thinking, tools, and isolation policy;
- cache hits;
- expected subject/grader jobs and bounded provider-request range;
- concurrency, soft request/spend caps, and hard per-job limits;
- unsupported or reduced-fidelity requirements.

Parallelism saves elapsed time, not tokens. Keep concurrency bounded and provider-aware.

When a soft wave cap is crossed, let active jobs settle, persist their evidence, and pause before the next job. Resume the same frozen wave only after owner-approved escalation. Hard timeout, output, or runaway-turn limits may stop one active job; preserve partial evidence for explicit retry.
