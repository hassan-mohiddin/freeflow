# Freeflow Evals

- `registries/`: eval definitions.
- `registries/skill-evidence.json`: explicit skill-to-eval grouping metadata.
- `fixtures/`: tiny repo fixtures used by fixture evals.
- `prompts/`: prompts referenced by registries.
- `scripts/`: local runners and audits.
- `reports/by-skill/`: skill-family eval reports.
- `reports/by-command-surface/`: slash-style command routing reports and matrix.
- `reports/iterations/`: early broad iteration reports.
- `reports/harness/`: eval runner and harness reports.
- `reports/acceptance/`: release acceptance reports.
- `reports/runtime/`: always-on runtime evidence.
- `runbooks/`: how to run specific eval families.
- `suites/`: curated release or acceptance suites.
- `runs/`: ignored generated output.

Use `registries/fixture-evals.json` for current adversarial fixture coverage.
Use `scripts/grade-fixture-eval.sh <eval-id> --output <run-output.md>` after fixture runs that define `objective_checks`; it grades mechanical evidence such as changed files, empty diffs, exit status, and fixed output/diff text.
Baseline fixture runs set `FREEFLOW_DISABLE_RUNTIME_CONTEXT=1` before launching nested agents so installed lifecycle hooks do not inject Freeflow workflow, interview-gate, discover, and workflow-map context into the baseline.
Use `scripts/skill-evidence.sh <skill>` to group command routes, eval definitions, acceptance membership, and reports for a skill.
Use `scripts/run-output-router-transform-eval.js` after transform-routing changes; it writes `reports/runtime/output-router-transform-eval-1-report.md`.
Use `scripts/run-pi-observed-routing-eval.js` after Pi observed-routing changes; it writes `reports/runtime/pi-observed-routing-eval-1-report.md`.
Use `npm run bench:router:vault-index` after vault-index interface/storage changes; it writes `reports/runtime/vault-index-storage-spike-1-report.md`.
Use `scripts/run-quickjs-wasi-proof-spike.js --quickjs-wasi-root <temp-or-installed-package-root>` after JavaScript sandbox-adapter proof changes; it writes `reports/runtime/quickjs-wasi-proof-spike-1-report.md`.
Use `reports/runtime/eryx-python-proof-spike-1-report.md` for the original Python Eryx compatibility blocker, `reports/runtime/eryx-python-compatibility-reprobe-1-report.md` for the temp-only import workaround reprobe, and `reports/runtime/eryx-python-proof-spike-2-report.md` for the 9/9 Eryx proof spike. Python script transform execution requires a proof-backed adapter from the global adapter cache or `FREEFLOW_ERYX_ROOT`, a JSPI-capable Node runner, and explicit `scriptTransform` opt-in.
Use `scripts/run-jq-wasm-proof-spike.js --jq-wasm-root <temp-or-installed-package-root>` after jq sandbox-adapter proof changes; it writes `reports/runtime/jq-wasm-proof-spike-1-report.md`.
Use `reports/runtime/script-sandbox-adapter-selection-review-1-report.md` for the adapter-family selection gate.
Use `reports/runtime/script-sandbox-probe-resource-hardening-1-report.md` for follow-up proof-probe resource hardening evidence. Use `scripts/run-output-router-transform-eval.js` for current transform-routing evidence. Script transform is disabled by default; JavaScript, Python, and jq execute only through explicit proof-backed adapter roots and `scriptTransform` config.
Use `scripts/validate-release-metadata.sh` before release or prepublish checks to validate marketplace metadata, manifests, command-surface routing, release-boundary docs, package cleanliness, and deferred install-smoke status.
Use `scripts/check-runtime-context-hook.sh` after changing plugin-bundled runtime context hooks.
Prefer the latest acceptance report over old smoke evals when evidence conflicts.
