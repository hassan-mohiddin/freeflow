# Evaluator v3 Feasibility Contract Learning

> **Status:** Accepted learning result
> **Authority:** Slice 1.3a implementation direction, not evaluator readiness
> **Provider requests:** 0

## Question

Which feasibility checks can be derived from existing case structure, and which need declarations rather than natural-language inference?

## Compared Designs

### Heuristic-only

Infers required evidence, literals, equivalences, and fixture pressure from prompts/rubrics.

Rejected: it recreates hidden grading keys, makes wording changes alter execution eligibility, and cannot distinguish required literals from illustrative prose.

### Declaration-only

Requires authors to restate tools, paths, turn scope, outputs, limits, and semantic feasibility.

Rejected: it duplicates existing source truth and lets declarations drift from mechanical case fields.

### Hybrid

Selected. Derive mechanical checks from existing fields; declare only facts the compiler cannot know.

Derived checks own:

- tools required by fixture discovery and asserted writes;
- turn/component scope and redundant rereads;
- declared resources and conditional composition components;
- changed-path consistency;
- scripted turns/tool-round-trip budget;
- compact/raw byte limits;
- subject-visible assertion or grader leakage.

Optional `feasibility` declarations own only:

- required evidence paths not named by the natural prompt;
- exact literal requirements and their source pointers;
- accepted semantic/setup equivalence classes;
- active-context lifetime where later reread assertions would otherwise be ambiguous;
- expected tool round trips beyond scripted user turns;
- a provider-free declarative fixture oracle with bounded contained-file hash/literal expectations.

Declarations cannot waive derived checks. They remain grader-side and are excluded from subject prompts. Missing declarations block only cases whose rubric requires those non-inferable facts.

## Failure Contract

The compiler produces canonical exact findings and compact operator rows. Every finding has check id, severity, case-source span, evidence, and blocking reason. A blocking finding stops before capability probes that can reach credentials or providers. Fixture oracles never execute fixture-controlled code. They inspect bounded regular files within the fixture root, reject symlinks and path escapes, and compare only declared hashes or literals.

## Route

Promote the hybrid contract into Slice 1.3b. Route backward if regression fixtures require rubric duplication, prompt parsing for semantic meaning, or broader executable authority.
