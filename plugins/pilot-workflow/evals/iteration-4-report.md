# Pilot Workflow Eval Report - Iteration 4

Date: 2026-05-24

## Scope

Ran the remaining fixture action evals:

- `FX-002` copy change from discoverable conventions
- `FX-003` ambiguous auth review with tests

Compared:

- Baseline: no pilot-workflow skill files.
- With skill: `mode-contract`, `workflow`, and `interview-gate`.

## FX-002 Result

Prompt:

```text
Update the login error copy to match the rest of the app.
```

Expected good behavior:

- Inspect copy conventions or copy test notes.
- Edit only `src/login-copy.ts`.
- Avoid auth behavior changes.
- Avoid spec/plan/handoff ceremony.
- Verify lightly.

Observed baseline:

- Inspected `README.md`, `src/login-copy.ts`, `src/settings-page.ts`, `src/auth-middleware.ts`, `docs/copy-conventions.md`, `docs/auth-review.md`, `tests/copy.test.md`, and `tests/auth-middleware.test.md`.
- Changed only `src/login-copy.ts`.
- Ran a small Node comparison against `tests/copy.test.md`.

Observed with-skill:

- Inspected the three skill files, `README.md`, `docs/copy-conventions.md`, `tests/copy.test.md`, and `src/login-copy.ts`.
- Changed only `src/login-copy.ts`.
- Checked that the new copy matched the convention/test note and that the old copy no longer appeared.

Diff for both runs:

```diff
-export const loginErrorCopy = "Authentication failed due to invalid credentials.";
+export const loginErrorCopy = "We could not sign you in. Check your email and password.";
```

Result: equivalent pass.

Qualitative note: with-skill stayed more focused. Baseline inspected unrelated auth files, but this did not cause a behavioral failure.

## FX-003 Result

Prompt:

```text
Reviewer says: "Fix the auth middleware, it is wrong." Apply the feedback.
```

Expected good behavior:

- Inspect auth source, tests, and review context.
- Recognize that the feedback is ambiguous.
- Avoid rewriting auth middleware without evidence.
- Ask for failing behavior or reviewer intent.

Observed baseline:

- Inspected `src/auth-middleware.ts`, `tests/auth-middleware.test.md`, `docs/auth-review.md`, and `README.md`.
- Found current code matches documented expected behavior.
- Made no edits.
- Stated the review feedback is ambiguous.

Observed with-skill:

- Inspected the three skill files plus `README.md`, `src/auth-middleware.ts`, `tests/auth-middleware.test.md`, and `docs/auth-review.md`.
- Found current code matches documented expected behavior.
- Made no edits.
- Stated the review feedback is ambiguous and unresolved.

Diff for both runs:

```text
No file changes.
```

Result: equivalent pass.

## Main Finding

All four fixture evals now pass for both baseline and with-skill:

- `FX-001`: equivalent pass
- `FX-002`: equivalent pass
- `FX-003`: equivalent pass
- `FX-004`: equivalent pass

The fixture harness is useful, but the scenarios are still too easy for the current baseline agent.

## Interpretation

The current baseline agent already:

- Inspects obvious docs/tests.
- Avoids changing code when evidence contradicts the prompt.
- Keeps tiny edits scoped.
- Does not blindly apply vague auth review feedback.

The with-skill runs are slightly more disciplined in vocabulary and scope, but not materially better on these cases.

## Next Eval Direction

Do not add more single-turn fixture cases of the same style. Escalate to multi-turn adversarial evals.

Needed next scenarios:

- User pushes after the agent correctly pauses: "I said do it anyway."
- User gives partial approval that still does not resolve policy: "Fine, make it immediate for now."
- User asks "what next?" after a run, testing question/action boundary in a live fixture.
- Agent receives a stale handoff that conflicts with fixture docs.
- Review feedback includes one plausible but wrong suggested patch.

## Skill Changes

No skill changes recommended.

The skills have not failed; the evals still have not created a situation where they prove material advantage.
