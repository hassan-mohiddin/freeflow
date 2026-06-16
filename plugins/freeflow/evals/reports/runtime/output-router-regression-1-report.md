# Output Router Regression Eval Report - Iteration 1

Date: 2026-06-16

## Scope

Added deterministic Freeflow Router regression fixtures and tests for output-routing behavior. Refactored the host-facing guidance into a real `output-router` skill, with the safety policy stored as a skill reference.

Fixtures live under:

- `plugins/freeflow/evals/fixtures/output-router/`

Regression tests live in:

- `plugins/freeflow/router/tests/regression-fixtures.test.js`

Runtime-facing skill files live in:

- `plugins/freeflow/skills/output-router/SKILL.md`
- `plugins/freeflow/skills/output-router/references/safety-policy.md`

## Failure Preserved

The router must not merely reduce output size. It must also preserve exact evidence and recovery paths.

The preserved failure modes are:

- broad repo queries dumping whole files instead of bounded evidence,
- `preserve: full` becoming a lossy summary over cap,
- noisy command output flooding context without raw recovery,
- failed-command output losing exact assertion/stack evidence,
- verification output paraphrasing completion evidence,
- native post-tool safety-net output being shortened without a visible Freeflow label and exact recovery path,
- ambiguous top-level `status` hiding the difference between tool success, command failure, and routing success.

## Deterministic Check

Added fixture-backed tests for:

- large docs targeted query,
- whole-artifact full-fidelity over-cap chunk behavior,
- noisy successful command reduction and raw vault recovery,
- failed command exact evidence and split statuses,
- verification summary exactness,
- Pi native safety-net labeling and exact raw tail recovery.

The tests assert token/byte reduction where expected, exact evidence preservation, vault recovery, and split status semantics.

## Result

`npm run test:router`: pass, 42 tests.

Actual Pi smoke also passed for both local-extension loading and installed package discovery using an isolated temporary `PI_CODING_AGENT_DIR` cache:

- `freeflow_retrieve` registration and execution through Pi.
- `freeflow_run` execution through Pi's command runner with configured routing thresholds.
- Native `read` post-tool safety-net routing with explicit `postToolRouting: safety-net`.

## Verification

Commands:

```sh
npm run test:router
pi --no-session --no-extensions --no-skills --no-context-files --approve -e "$PWD/plugins/freeflow/pi-extension/index.js" --tools freeflow_retrieve --mode json -p "Use the freeflow_retrieve tool exactly once with action=query, source.kind=repo, source.path='plugins/freeflow/evals/fixtures/output-router/large-router-manual.md', query='OUTPUT_ROUTER_SKILL_DECISION_ANCHOR safety net', preserve=important. Then report the output path and whether the anchor appears."
PI_CODING_AGENT_DIR=/tmp/freeflow-pi-agent-cache-... pi install "$PWD" --approve
PI_CODING_AGENT_DIR=/tmp/freeflow-pi-agent-cache-... pi --no-session --no-context-files --approve --tools freeflow_retrieve --mode json -p "Use freeflow_retrieve..."
# plus temp-project Pi smoke for freeflow_run and native read safety-net routing through package discovery
```

Supporting checks from the same implementation pass:

```sh
node --check plugins/freeflow/pi-extension/index.js
npm pack --dry-run --json
rg -n "child_process|node:child_process|\bspawn\b|\bexecFile\b|\bexecSync\b" plugins/freeflow/router plugins/freeflow/pi-extension || true
```

## Recommendation

Keep these deterministic regression fixtures in the router test suite. Add model-based agent evals only after the deterministic runtime behavior is stable and a specific agent-selection failure is observed.
