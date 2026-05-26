# Handoff Eval Report - Iteration 3

Date: 2026-05-24

## Scope

Focused only on HOF-003: ambiguous temp handoff versus memory handoff.

HOF-001 and HOF-002 were not rerun in this iteration. Their latest full-suite results remain in `handoff-2-report.md`.

## Problem

The handoff skill already said to ask when type or destination was ambiguous, but the rule was below the initial classification section.

In the failing run, the agent read the rule and still reasoned its way into choosing repo memory because live repo evidence conflicted with the old handoff.

This confirmed the known failure:

```text
The rule existed, but it was too buried and too soft to stop destination reasoning.
```

## Skill Change

Moved the ambiguity rule to the top of `skills/handoff/SKILL.md` as a stop-first rule:

- If the request mixes immediate continuation language with durable memory language, do not inspect, classify, or write yet.
- Examples include "after compaction, but maybe repo memory" and "you decide" when temp vs memory is unclear.
- Ask one concise question and stop.

The skill still avoids templates and keeps the rest of the handoff behavior compact.

## Eval Change

HOF-003 now treats any file change as failure:

- `registries/handoff-evals.json` says any created, modified, or deleted file fails.
- `handoff-eval-runbook.md` records the empty-diff rule.
- `run-codex-fixture-eval.sh` supports `FREEFLOW_REQUIRE_EMPTY_DIFF=1` for strict focused runs.

## Results

| Eval | Before Fix | After Fix | Read |
|---|---:|---:|---|
| HOF-003 ambiguous temp vs memory | 0/10 | 10/10 | Before fix, with-skill created `docs/handoffs/billing-policy-continuation.md`. After fix, with-skill asked the temp-vs-memory question and made no file changes. |

## Evidence

Pre-fix focused run:

- Output: `plugins/freeflow/evals/runs/handoff-3/hof-003/current-with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/handoff-3/hof-003/current-with-skill-output.diff`
- Result: failed because it created a repo memory handoff.

Post-fix focused run:

- Output: `plugins/freeflow/evals/runs/handoff-3/hof-003/with-skill-output.md`
- Diff: `plugins/freeflow/evals/runs/handoff-3/hof-003/with-skill-output.diff`
- Result: passed because the final response was only:

```text
Should this be a temporary handoff for the next chat, or a repo memory handoff under `docs/handoffs/`?
```

The post-fix diff was 0 bytes.

## Verification

Commands run:

```sh
FREEFLOW_REQUIRE_EMPTY_DIFF=1 plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh \
  plugins/freeflow/evals/fixtures/tiny-handoff-app \
  plugins/freeflow/evals/runs/handoff-3/hof-003/with-skill \
  with-skill \
  plugins/freeflow/evals/prompts/hof-003.txt \
  plugins/freeflow/evals/runs/handoff-3/hof-003/with-skill-output.md \
  plugins/freeflow/skills/mode-contract/SKILL.md \
  plugins/freeflow/skills/workflow/SKILL.md \
  plugins/freeflow/skills/interview-gate/SKILL.md \
  plugins/freeflow/skills/verify-work/SKILL.md \
  plugins/freeflow/skills/handoff/SKILL.md

wc -c plugins/freeflow/evals/runs/handoff-3/hof-003/with-skill-output.diff
jq . plugins/freeflow/evals/registries/handoff-evals.json >/dev/null
bash -n plugins/freeflow/evals/scripts/run-codex-fixture-eval.sh
```

Verification results:

- Focused HOF-003 strict run exited 0.
- Post-fix diff size was `0`.
- `registries/handoff-evals.json` parsed with `jq`.
- Eval harness shell syntax passed `bash -n`.

## Recommendation

Treat HOF-003 as fixed.

Next useful step is to rerun the full handoff eval set only if we want to check that moving the stop-first rule did not regress HOF-001 or HOF-002.
