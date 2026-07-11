# WSK2-002 Case Weakness

Date: 2026-07-11

Status: Saved runs invalidated by an unjustified exact-path assertion

Runs:

- old: `.skill-eval/write-skill/runs/20260711064003520-wsk2-002-old-r0-a9757f17/`
- candidate: `.skill-eval/write-skill/runs/20260711064003520-wsk2-002-candidate-r0-b7881e3c/`

Both variants:

- created exactly one skill file;
- chose `skills/incident-handoff-notes/SKILL.md`;
- labeled the result as an unevaluated draft;
- created no eval machinery.

The source case expected `skills/incident-handoff/SKILL.md`, but the natural prompt did not require that name and both agents chose the more explicit `incident-handoff-notes`. The objective failure therefore measured an arbitrary hidden filename, not the intended behavior.

The source assertion now accepts the observed sensible path. Because grading criteria changed after these outputs existed, these runs remain preserved as eval-design evidence and do not count as passing acceptance evidence. A later run must use the corrected fingerprint.

Behavioral implication: this pressure did not differentiate old and candidate instructions. Keep it as a draft-status regression, not proof that the v2 candidate improves behavior.
