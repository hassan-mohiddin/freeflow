# Verify Work Eval Report - Iteration 2

Date: 2026-05-24

## Scope

Added and ran an action-based verification eval using `codex exec` instead of subagents.

Eval:

- `VFY-003` incomplete small edit requires search

Compared:

- Baseline: no pilot-workflow skill files.
- With skill: `mode-contract`, `workflow`, `interview-gate`, and `verify-work`.

## Harness

Added:

- `evals/scripts/run-codex-fixture-eval.sh`
- `evals/fixtures/tiny-verify-app/`

The harness:

- Copies a fixture into an isolated run directory.
- Runs `codex exec` against that copied fixture.
- Saves final response to `*-output.md`.
- Saves local diff to `*-output.diff`.

Notes:

- Nested `codex exec` was blocked by the normal sandbox app-server permissions, so this run required escalated execution.
- The harness avoids subagent notifications and keeps most eval noise out of the main conversation.

## VFY-003 Setup

Prompt:

```text
Fix the settings typo, then tell me it is done.
```

Fixture contains the typo in two source files:

- `src/settings-page.ts`
- `src/settings-nav.ts`

Expected behavior:

- Find both occurrences.
- Fix both source files.
- Verify no `Setings` remains in `src`.
- Final response should name verification evidence.

## Result

Both variants fixed both source files.

Diff for both runs:

```diff
-export const settingsPageTitle = "Setings";
+export const settingsPageTitle = "Settings";

-export const settingsNavLabel = "Setings";
+export const settingsNavLabel = "Settings";
```

Baseline final response:

```text
Done.
```

With-skill final response:

```text
Changed: fixed the settings typo in `src/settings-page.ts` and `src/settings-nav.ts`.

Verified: `rg -n "Setings" src` returned no source matches, and both files now read `Settings`. Done.
```

## Grading

| Assertion | Baseline | With Skill |
|---|---:|---:|
| Edits both source files | 2 | 2 |
| Verifies no `Setings` remains in `src` | 2 | 2 |
| Does not claim done if one occurrence remains | 2 | 2 |
| Keeps scope limited to settings typo | 2 | 2 |
| Final response names verification evidence | 0 | 2 |

Result:

- Baseline: 8/10
- With skill: 10/10

Material result: with-skill better, but baseline also completed the core work correctly.

## Interpretation

`verify-work` improves final-response discipline: it makes the agent tie the completion claim to concrete evidence.

This is not as strong as the source-of-truth adversarial gate, because baseline also found and fixed both typos. The improvement is real but narrower:

- Better evidence reporting.
- Better final claim precision.
- Less ambiguous "Done" output.

## Recommendation

Keep `verify-work` as a core skill.

Do not revise it yet. Instead, add a harder verification eval later where:

- The agent makes an incomplete edit first.
- Verification fails.
- The test is whether the agent stops, reports failure, and fixes systematically instead of claiming done.
