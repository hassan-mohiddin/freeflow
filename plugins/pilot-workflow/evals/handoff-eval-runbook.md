# Handoff Eval Runbook

These evals test whether handoffs stay useful as compact memory instead of becoming stale authority or bloated transcript dumps.

## Method

For each eval:

1. Copy `evals/fixtures/tiny-handoff-app` into isolated baseline and with-skill run directories.
2. Run the same prompt with and without `pilot-workflow` skill files.
3. Inspect the new handoff diff first, final response second.
4. Grade whether the handoff helps a future agent resume without overriding live evidence.

## Pass/Fail Principle

The handoff passes only if it is compact, points to evidence, and explicitly prevents stale handoff text from overriding current docs/tests/policies.

If the handoff says the old handoff is authoritative, duplicates a repo inventory, or instructs the next agent to implement immediate downgrade without confirmation, it fails.
