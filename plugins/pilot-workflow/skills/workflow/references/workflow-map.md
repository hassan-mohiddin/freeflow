# Pilot Workflow Map

Use this when the user asks how the whole workflow fits together, public docs need a diagram, or the next workflow entry point is unclear.

This map is orienting, not mandatory. Small reversible work can skip unnecessary artifacts and gates. Re-enter clarification whenever new ambiguity would change the next action.

## Compact Map

Use this compact version in public README-style docs.

```mermaid
flowchart LR
  Request{request}
  Talk[conversation<br/>answer directly]
  Discover[discover<br/>research / grill]
  Spec[spec]
  Plan[plan]
  Build[build<br/>execute / diagnose]
  Check[review + verify]
  Close[commit / handoff]

  Request -->|question| Talk
  Request -->|work| Discover
  Discover --> Spec --> Plan --> Build --> Check --> Close
  Check -. new evidence or failed check .-> Discover
```

```text
Use conversation mode for questions. Use workflow mode for consequential work.
Use strict-workflow for risky work; same spine, stronger gates.
Loop back when new evidence, source conflicts, user-owned decisions, or failed checks change the path.
```

## Reference Map

Use this fuller version when choosing an entry point or explaining the workflow lifecycle.

```mermaid
flowchart TD
  Request([User request]) --> Mode{Mode}

  Mode -->|question, critique, explanation| Conversation[conversation mode<br/>answer directly]
  Conversation --> Done([done])

  Mode -->|consequential work| Workflow[workflow mode<br/>scale to risk]
  Mode -->|high-risk or hard to reverse| Strict[strict-workflow mode<br/>stronger gates]

  Workflow --> Entry{Choose entry point}
  Strict --> Entry

  Entry --> Discovery[Discovery<br/>research-brief<br/>grill-context<br/>interview-gate]
  Entry --> Spec[Spec<br/>write-spec<br/>review-artifact]
  Entry --> Plan[Plan<br/>write-plan<br/>review-artifact]
  Entry --> Build[Build or diagnose<br/>execute-plan<br/>diagnose-failure]
  Entry --> Closeout[Closeout<br/>review-work<br/>verify-work<br/>commit-work]

  Discovery --> Spec
  Spec --> Plan
  Plan --> Build
  Build --> Closeout
  Closeout --> Handoff[handoff<br/>capture-decisions when durable]
  Handoff --> Done

  Reenter[Re-enter discovery<br/>new evidence, owner decision,<br/>source conflict, or failed check]
  Spec -.-> Reenter
  Plan -.-> Reenter
  Build -.-> Reenter
  Closeout -.-> Reenter
  Handoff -.-> Reenter
  Reenter --> Discovery

  Bypass[bypass<br/>skip ceremony, not judgment] -.-> Entry
```

## Common Entry Points

- Use `conversation mode` when the user asks a question, wants critique, or is exploring.
- Use `research-brief` when repo, domain, evidence, or current facts are unknown.
- Use `grill-context` or `interview-gate` when direction is vague, source truth conflicts, or user-owned decisions are still open.
- Use `write-spec` when requirements are agreed but not durable.
- Use `review-artifact` when a spec, plan, handoff, or decision note must guide future work.
- Use `write-plan` when an approved spec or explicit task context exists.
- Use `execute-plan` when an approved plan exists.
- Use `diagnose-failure` when behavior is broken, failing, flaky, slow, or unclear.
- Use `review-work` and `verify-work` before claiming consequential work is ready.
- Use `commit-work` only after the intended diff is reviewed and verification evidence exists.
- Use `handoff` when pausing, compacting, or transferring context.
- Use `capture-decisions` only for stable decisions, glossary terms, rejected approaches, or ADR-worthy tradeoffs.
- Use `bypass` only to skip unnecessary ceremony. It cannot skip user-owned decisions, source-truth conflicts, risky checks, or verification claims.
