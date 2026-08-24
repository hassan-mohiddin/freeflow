# Simplification Patterns

Read this before choosing a simplification transformation or deciding whether deletion really reduces complexity. Use these patterns as candidates, not automatic rules. Preserve behavior and project conventions.

## Control Flow

- Replace deep nesting with guard clauses when exits are truly equivalent.
- Collapse duplicate branches into one named path.
- Replace repeated conditionals on one shape with an explicit model or dispatcher when that removes branching across callers.
- Name intermediate concepts when a dense expression hides intent.
- Keep straightforward branching when a lookup, callback table, or polymorphic hierarchy would add more concepts.

## Locality

- Move behavior toward the state or policy it owns.
- Gather scattered validation, normalization, or failure handling behind one stable seam.
- Separate orchestration from business rules when each can then be read and tested independently.
- Reuse a canonical helper instead of maintaining a near-duplicate.
- Do not centralize unrelated behavior merely because its syntax looks similar.

## Indirection

Question:

- pass-through wrappers;
- one-use factories and strategy layers;
- aliases that no longer protect compatibility;
- helpers whose interface is as complex as their implementation;
- extension points with no accepted variation;
- adapters that outlived a migration.

Keep indirection when it hides volatile dependencies, enforces policy, preserves a real compatibility contract, or creates meaningful test and change locality.

## Names And Types

- Rename generic or misleading terms to match domain language.
- Make invariants explicit at a type or interface boundary when doing so removes downstream checks.
- Remove casts, optionality, and silent fallbacks only after proving the stronger invariant.
- Keep comments that explain why, constraints, or non-obvious tradeoffs; remove comments that merely narrate clear code.

## Duplication

Duplication is harmful when one behavior must change in several places and can drift.

Do not extract merely because two snippets look alike. First confirm they represent the same concept and should evolve together.

A small amount of explicit repetition can be simpler than a generalized abstraction with configuration, callbacks, flags, or hidden coupling.

## Dead And Legacy Paths

Before removal, inspect static references, runtime use, generated callers, config, tests, history, and compatibility obligations.

- Truly dead local code may be removed within the agreed simplification boundary.
- Supported legacy behavior requires deprecation/migration evidence.
- Historical docs and audit evidence are not dead code.
- Commented-out code normally belongs in version history, but confirm it is not an intentional operational instruction.

## Before And After Test

Ask:

- Are there fewer concepts and branches?
- Is ownership clearer?
- Can behavior be understood through fewer files or transitions?
- Did error and failure semantics remain visible?
- Is the public interface smaller or unchanged?
- Did tests become more behavior-focused rather than more coupled?
- Would the next likely change touch fewer coordinated locations?

If the answer is mostly no, complexity was relocated rather than reduced.
