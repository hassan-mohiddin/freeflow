# Agent-First Instructions

Write the instruction the executing agent needs at the moment of choice.

## Strong Rules

A useful rule names:

- the trigger or pressure;
- the required or forbidden action;
- the evidence or stop condition.

Prefer:

> If the existing eval already preserves the failure and criteria, reuse it unchanged. Do not mutate evidence to prove process order.

Over:

> Ensure the evaluation workflow remains efficient and aligned with best practices.

## Placement

Order by behavioral priority:

1. user authority and source truth;
2. destructive or irreversible stops;
3. evidence and verification requirements;
4. normal execution;
5. convenience and style.

A late caveat rarely defeats an early command. Move the real constraint to where the agent first chooses.

## Editing From Failure

- Name the failed behavior.
- Find the sentence that should have prevented it.
- Sharpen or move that sentence before adding sections.
- Keep unrelated rules stable.
- Re-test the same pressure.
