# Token-Efficient Execution

Optimize model calls, not merely wall-clock time.

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
- expected subject and semantic model calls;
- concurrency and call/spend caps;
- unsupported or reduced-fidelity requirements.

Parallelism saves elapsed time, not tokens. Keep concurrency bounded and provider-aware.
