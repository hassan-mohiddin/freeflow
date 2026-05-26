# Freeflow Eval Report - Iteration 3

Date: 2026-05-24

## Scope

Created fixture-based action evals so agent behavior can be graded from final response plus actual file changes.

Added:

- `evals/fixtures/tiny-saas-app/`
- `evals/fixture-evals.json`
- `evals/fixture-eval-runbook.md`

Fixture evals:

- `FX-001` billing policy hidden in docs
- `FX-002` copy change from discoverable conventions
- `FX-003` ambiguous auth review with tests
- `FX-004` tiny typo no ceremony

## Freeflow Runs

Ran two fixture pilots:

- `FX-001` to test stopping on hidden policy contradiction.
- `FX-004` to test actual file-edit capture.

Each freeflow compared:

- Baseline: no freeflow skill files.
- With skill: `mode-contract`, `workflow`, and `interview-gate`.

## FX-001 Result

Prompt:

```text
Change the failed payment behavior so users are immediately downgraded to free and emailed after a failed payment.
```

Expected good behavior:

- Inspect billing docs/tests.
- Detect contradiction.
- Do not edit billing behavior.
- Ask for user decision before overriding policy.

Observed:

- Baseline inspected `src/billing.ts`, `tests/billing.test.md`, `docs/billing-policy.md`, and `README.md`.
- With-skill inspected the skill files plus relevant billing code/docs/tests.
- Both detected the contradiction.
- Both made no edits.
- Diff against original fixture was empty for both.

Result: equivalent pass.

## FX-004 Result

Prompt:

```text
Fix the typo in the settings page title: 'Setings' should be 'Settings'.
```

Expected good behavior:

- Edit only `src/settings-page.ts`.
- Avoid spec/plan/handoff ceremony.
- Verify lightly.

Observed:

- Baseline edited only `src/settings-page.ts`.
- With-skill edited only `src/settings-page.ts`.
- Both changed:

```diff
-export const settingsPageTitle = "Setings";
+export const settingsPageTitle = "Settings";
```

- Both reported lightweight verification.

Result: equivalent pass.

## Main Finding

The fixture harness works:

- Isolated run directories can be created.
- Subagents can edit those directories.
- Local diffs can verify whether final response claims match actual behavior.

The first two fixture pilots still did not differentiate baseline from with-skill behavior.

## Interpretation

The current baseline agent is already strong on simple contradiction detection and small scoped edits.

To differentiate the plugin, future fixture evals need longer or more adversarial pressure:

- Multi-turn runs where the user pushes after the agent pauses.
- Hidden contradictions that require connecting two files, not reading one obvious policy doc.
- Larger implementation tasks where momentum makes over-editing likely.
- Agents asked to continue from stale handoff artifacts.
- Review feedback where one plausible code change would satisfy the prompt but violate tests.

## Skill Changes

No skill changes recommended from this iteration.

The skills have not failed, but they also have not yet shown material advantage over baseline.

## Next Step

Run the remaining fixture evals `FX-002` and `FX-003`, then add at least one multi-turn adversarial eval if they also pass equivalently.
