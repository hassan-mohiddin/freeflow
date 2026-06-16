# Project Handoff

Date: 2026-06-16

## Purpose

Continue Freeflow output-router work after implementation, Pi smoke testing, and discovery of a broad-retrieval accuracy bug.

This handoff is memory, not authority. Reopen linked live files before consequential edits. Live repo evidence overrides this document.

## Stable Context

The output router is a Pi-first, host-portable routed-output system. It now has:

- Router core in `plugins/freeflow/router/src/`, compiled to `plugins/freeflow/router/dist/`.
- Pi adapter changes in `plugins/freeflow/pi-extension/index.js`.
- Runtime-facing skill in `plugins/freeflow/skills/output-router/SKILL.md`.
- Safety policy reference in `plugins/freeflow/skills/output-router/references/safety-policy.md`.
- Deterministic regression fixtures in `plugins/freeflow/evals/fixtures/output-router/`.
- Regression/evidence report in `plugins/freeflow/evals/reports/runtime/output-router-regression-1-report.md`.

Current design/spec/plan files were updated away from the earlier bootstrap-only shape:

- `docs/specs/freeflow-output-router-design.md`
- `docs/plans/2026-06-16-freeflow-output-router-implementation-plan.md`

The earlier `plugins/freeflow/router/bootstrap/output-router-context.md` and `docs/specs/freeflow-output-router-safety-policy.md` were removed/replaced by the real `output-router` skill + skill reference.

## Decisions Made

- Use a real `output-router` skill, loaded with its safety-policy reference like `workflow` and `interview-gate`, instead of a standalone bootstrap context artifact.
- Keep native `read`, `bash`, `edit`, and `write` direct by default.
- Expose explicit tools:
  - `freeflow_retrieve`
  - `freeflow_run`
- `freeflow_run` uses Pi's host-approved `pi.exec` adapter path; router core does not call raw Node shell execution APIs.
- `outputRouter.postToolRouting` remains config-controlled and defaults to `off`.
- Optional Pi native safety net handles only native `read` and `bash` results when enabled.
- Vault root defaults to `~/.cache/freeflow-router/vault`.
- Vault TTL metadata defaults to 7 days; pruning is still deferred.
- Status fields stay split:
  - `toolStatus`
  - `execution.status`
  - `routing.status`
- Router runtime remains deterministic for now; no LLM inside retrieval/routing.
- `node_modules/` was added to `.gitignore`; it may exist locally for editor typings but must not be committed.

## What Was Implemented

### Router core

Key files:

- `plugins/freeflow/router/src/types.ts`
- `plugins/freeflow/router/src/schema.ts`
- `plugins/freeflow/router/src/config.ts`
- `plugins/freeflow/router/src/vault.ts`
- `plugins/freeflow/router/src/retrieve.ts`
- `plugins/freeflow/router/src/run.ts`
- `plugins/freeflow/router/src/index.ts`
- `plugins/freeflow/router/tsconfig.json`

Implemented behavior:

- Core schemas/types and validators.
- Session-linked vault with immutable object store and per-session `index.json`.
- Command records with `stdout.txt`, `stderr.txt`, `combined.txt`, and `meta.json`.
- Text output records with `raw.txt`.
- Repo-file metadata records without copying whole repo files by default.
- `freeflowRetrieve` for repo and vault sources.
- `freeflowRun` with adapter-provided runner, raw capture before routing, routed command evidence, and recovery hints.
- `normalizeRouterConfig` for `.freeflow/config.json` `outputRouter` config.
- Pi custom TUI renderers for `freeflow_retrieve` and `freeflow_run` collapsed/expanded views.

### Pi extension

Key file: `plugins/freeflow/pi-extension/index.js`

Implemented behavior:

- Registers `freeflow_retrieve` and `freeflow_run` custom tools.
- Loads `output-router` skill and `output-router/references/safety-policy.md` into runtime context, not a standalone bootstrap artifact.
- Reads `outputRouter` config from `.freeflow/config.json`.
- Wires `freeflow_run` to `pi.exec("bash", ["-lc", command], ...)`.
- Adds compact/expanded custom TUI rendering for `freeflow_retrieve` and `freeflow_run`; `ctrl+o` expands structured status, evidence, and recovery details.
- Adds optional `tool_result` safety net for native `read` and `bash` only when `postToolRouting` is enabled.
- Safety-net transformed native output is labeled, vaulted, and recoverable by `outputId`.
- Safety-net failure fails open: original native output is preserved and warning appended.

### Package/build

`package.json` now has:

- `build:router`
- `test:router`
- dev deps: `typescript`, `@types/node`
- package whitelist includes `plugins/freeflow/router/dist/**`; router source/tests are not packaged.

## Verification Evidence

### Automated

Latest automated checks passed:

```sh
npm run test:router
# pass: 45 tests

node --check plugins/freeflow/pi-extension/index.js

npm pack --dry-run --json
# package includes router dist and output-router skill/reference
# package excludes router src/tests

rg -n "child_process|node:child_process|\bspawn\b|\bexecFile\b|\bexecSync\b" plugins/freeflow/router plugins/freeflow/pi-extension || true
# no raw Node shell execution APIs found
```

### Real Pi local-extension smoke

Using `pi -e "$PWD/plugins/freeflow/pi-extension/index.js"`:

- `freeflow_retrieve` registered and returned exact fixture evidence.
- `freeflow_run` used Pi runtime execution and returned `toolStatus=ok`, `execution.status=success`, `routing.status=partial`, and `outputId=ffout_...`.
- Native `read` safety-net routed output when `postToolRouting=safety-net`.

### Installed-cache/package-discovery smoke

The working tree was synced into Pi's installed package cache at:

```text
/Users/mohammedhassanmohiddin/.pi/agent/git/github.com/hassan-mohiddin/freeflow
```

The user ran `/reload`, then package-discovery smoke passed without `-e` override:

- `freeflow_retrieve` found `OUTPUT_ROUTER_SKILL_DECISION_ANCHOR` in `plugins/freeflow/evals/fixtures/output-router/large-router-manual.md`.
- `freeflow_run` returned `toolStatus: ok`, `execution.status: success`, `routing.status: routed`, and an `outputId`.
- Native `read` safety net with `postToolRouting=safety-net` returned `Freeflow routed this native read result` and `outputId=ffout_...`.

### Vault verification

A manual vault check using default vault root passed:

```json
{
  "vaultRoot": "/Users/mohammedhassanmohiddin/.cache/freeflow-router/vault",
  "sessionId": "manual-vault-check-2026-06-16",
  "outputId": "ffout_3c70f28e7a435c3d8041d169",
  "executionStatus": "success",
  "routingStatus": "partial",
  "rawRecoveredExactly": true,
  "retrievedEvidence": [
    {
      "lines": "16-20",
      "excerpt": "vault check line 16\nvault check line 17\nVAULT_CHECK_MARKER exact persisted line\nvault check line 19\nvault check line 20"
    }
  ]
}
```

Vault files exist under:

```text
~/.cache/freeflow-router/vault/objects/sha256_.../
  meta.json
  stdout.txt
  stderr.txt
  combined.txt
```

Note: `freeflow_retrieve` repo searches do not vault by default; vault is for `freeflow_run`, native safety-net output, and other captured text outputs.

## Accuracy Finding: Broad Retrieval Bug

The user tested a realistic broad lookup:

```md
### Sandbox Permissions

`SandboxPermissions` is a per-command request shape.

Codex defines:

```text
UseDefault
RequireEscalated
WithAdditionalPermissions
```

Plain-language meaning:
```

Correct location:

```text
docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md:523-535
```

But broad `freeflow_retrieve` from repo root returned:

```text
graphify-out/graph.html:67-71
```

This is a real bug. Cause in `plugins/freeflow/router/src/retrieve.ts`:

- `SKIP_DIRS` currently skips only `.git`, `node_modules`, `dist`, `.next`, `coverage`.
- It does not skip `graphify-out/**`.
- Candidate scoring is line-based and term-frequency based:

```ts
score = lineScore * 4 + pathScore + headingBonus
```

For the failing query:

```text
graphify-out/graph.html:69
line size: 202,028 bytes
lineScore: 353
score: 1412

actual target line 525
lineScore: 8
score: 36
```

The huge `const RAW_NODES = [...]` line in `graphify-out/graph.html` contains many repeated common tokens (`is`, `text`, `codex`, `request`, `permissions`) and dominates simple term frequency scoring.

Bad effects:

- Returned generated artifact instead of source docs.
- Returned a 319,631-byte excerpt.
- Pi JSONL output for that query was ~6.8MB and ~110k tokens.

## Benchmark Snapshot

Approx token estimate: bytes / 4.

| Case | Native/raw | Router result | Finding |
| --- | ---: | ---: | --- |
| Noisy command via `freeflow_run` | 11,494 bytes / ~2,874 tokens | 1,077 bytes / ~270 tokens | 90.6% smaller; exact vault recovery passed |
| Failed small command via `freeflow_run` | 423 bytes / ~106 tokens | 881 bytes / ~221 tokens | Overhead is larger for small output; exact failure evidence preserved |
| Native whole-doc read for SandboxPermissions | 70,106 bytes / ~17,527 tokens | n/a | Correct if model searches full file; expensive |
| Native `rg` exact search proxy | 112 bytes / ~28 tokens | n/a | Correct and cheapest if agent chooses exact search |
| Broad `freeflow_retrieve` | n/a | 358,856 bytes / ~89,714 tokens | Wrong path; generated artifact bug |
| Scoped `freeflow_retrieve` exact file | n/a | 1,243 bytes / ~311 tokens | Correct path; partial block |
| Expanded scoped `freeflow_retrieve` | n/a | 2,307 bytes / ~577 tokens | Correct full block |

Conclusion: `freeflow_run` + vault works. Broad `freeflow_retrieve` accuracy and context bounding need improvement before docs or completion claims.

## External Research Takeaways

Recent search/retrieval references support these improvements:

- BM25-style lexical scoring with term-frequency saturation and document-length normalization prevents keyword-stuffed/large docs from dominating.
- Exact keyword search is strong for technical identifiers, literals, and config keys.
- Hybrid pipelines often combine exact/literal matching, BM25, semantic retrieval, and reranking; for current deterministic runtime, start with exact + BM25-style lexical ranking.
- Chunking matters: score bounded chunks/sections, not whole files or unbounded lines.
- File filtering/globs are essential; generated artifacts should be excluded by default or strongly downranked.

## Live Evidence

Reopen these before continuing:

- `plugins/freeflow/router/src/retrieve.ts` — broad retrieval bug lives here.
- `plugins/freeflow/router/tests/regression-fixtures.test.js` — add the SandboxPermissions broad-lookup failure here.
- `plugins/freeflow/evals/fixtures/output-router/` — add/extend fixtures for generated-artifact and huge-line retrieval failures.
- `plugins/freeflow/skills/output-router/SKILL.md` — router tool-choice guidance.
- `plugins/freeflow/skills/output-router/references/safety-policy.md` — exactness-sensitive behavior.
- `plugins/freeflow/evals/reports/runtime/output-router-regression-1-report.md` — current evidence report; update after fixes.
- `docs/specs/freeflow-output-router-design.md` — spec now points to output-router skill, not bootstrap artifact.
- `docs/plans/2026-06-16-freeflow-output-router-implementation-plan.md` — plan updated to skill-based shape but still has historical slice framing.

## Next Focus

Do not proceed to documentation yet. Fix retrieval accuracy and context bounding first.

Recommended next slice:

1. Add failing regression for the exact SandboxPermissions broad-repo query.
   - Expected path: `docs/codex-cli-agent-harness/2026-06-12-pass-3-sandboxing-and-permissions.md`.
   - Expected returned excerpt must be bounded and must not include `graphify-out/graph.html`.
2. Add generated-path excludes by default:
   - `graphify-out/**`
   - likely `*.min.*`, generated HTML/JSON, and other project-specific generated artifacts as conservative defaults or config hints.
3. Add long-line/excerpt caps.
   - Never return a 200KB line as one evidence excerpt.
   - Exact recovery can point to retrieval expansion/full read; context injection must stay bounded.
4. Improve matching order:
   - exact multiline/phrase match first,
   - heading + nearby text match second,
   - then bounded lexical/BM25-like scoring.
5. Improve scoring:
   - remove/ignore stopwords like `is`, `text`, maybe query punctuation tokens like `shape.`;
   - term-frequency saturation;
   - document/chunk length normalization;
   - prefer Markdown docs/source files over generated artifacts when scores are similar.
6. Re-run benchmark and update `output-router-regression-1-report.md` or create iteration 2 report.
7. Only after retrieval accuracy passes, proceed to documentation and final handoff.

## Stop Conditions

Stop and ask before:

- Enabling post-tool routing by default.
- Adding model-assisted summarization/classification inside router runtime.
- Changing public tool names or schemas.
- Changing vault durability/location semantics.
- Rewriting specs/tests to make the bug disappear instead of fixing retrieval.
- Claiming output router is complete without passing the broad-retrieval regression and rerunning Pi smoke.

## Current Local State Notes

- Working tree and installed Pi cache both contain uncommitted output-router changes.
- Installed Pi cache path was manually synced for `/reload` testing:
  `~/.pi/agent/git/github.com/hassan-mohiddin/freeflow`.
- No commit/push has been done.
- `node_modules/` may exist locally for VS Code typings and is now ignored by `.gitignore`; do not commit it.
- Run `git status --short` in both working tree and installed cache before committing or syncing again.
