# Interaction Contract behavioral evaluation

This suite compares the pre-change Interaction Contract at Git commit
`dd40bfa11c202b538b2a88e740baaead96a7c23b` with the working-tree candidate.
Workflow, prompts, tools, fixtures, context, and model configuration are held
constant between variants.

The cases cover four separate questions:

- clear action requests should proceed without unnecessary permission-seeking;
- a mixed question/action turn should answer first and wait for clear authorization;
- unsupported user claims should be evaluated against evidence rather than accepted;
- supported user claims should be acknowledged when the evidence warrants it.

These cases are bounded behavioral evidence for this model, composition, and
prompt set. They do not establish general readiness or behavior on every host.

## Adversarial suite

`adversarial-suite.json` adds pressure cases for mixed approval and questions,
explicit answer-then-act sequencing, false claims that discourage inspection,
and separate authorization after an initial wait. It uses the same fixed
baseline/candidate composition and must be interpreted from its persisted
transcripts and workspace effects.
