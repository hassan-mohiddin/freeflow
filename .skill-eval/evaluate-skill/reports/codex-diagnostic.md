# Codex Diagnostic Capability

> Internal diagnostic engineering evidence only. No Codex model/provider request was made. This report does not support Codex, cross-host, or Production-Ready acceptance. `write-skill` and `evaluate-skill` remain Unverified.

## Supported Statement

The evaluator contains a concrete reduced-fidelity diagnostic adapter for `codex-cli 0.144.1` on macOS. Deterministic evidence supports:

- isolated evaluator-owned `HOME` and `CODEX_HOME`;
- copied `auth.json` only at the internal adapter seam, mode `0600`;
- exact built-in `openai` provider binding with no custom/fallback provider;
- one declared skill and disabled bundled/ambient skills;
- `project_doc_max_bytes = 0` and ignored exec-policy rules;
- immutable `codex-diagnostic-macos-v1` permissions: minimal runtime read, declared skill read, fixture write, all other paths denied, and no direct network;
- strict explicit `$skill-name` invocation through ephemeral JSONL exec configuration;
- timeout/process-tree, retained-output, raw-transport, symlink, subject-integrity, lifecycle-order, terminal-evidence, and cleanup failure behavior;
- token usage when reported, with provider-request count and monetary cost preserved as unavailable;
- portable case planning and role-qualified fingerprints without host fallback;
- public Codex planning and doctor limited to `codex --version`.

Public Codex evaluation remains blocked before auth access, runtime materialization, `codex exec`, sandbox probes, or model startup because hard provider-request and spend bounds are unavailable. No accepted Codex `result.json` exists.

## Unsupported Boundaries

Codex CLI 0.144.1 can issue repeated successful sampling requests inside one CLI turn. It reports aggregate tokens but not provider-request count or monetary cost. Wall-clock/output termination cannot prevent an additional request or spend overrun before observation.

Therefore this implementation does not support:

- paid Codex evaluation;
- accepted Codex or cross-host evidence;
- provider-request or spend hard-limit claims;
- model-independent or Production-Ready claims;
- external request proxies, app-server, generic host registries, fallback, multi-turn, resume, batching, cache, concurrency, or partial reuse.

## No-Provider Capability Proof

Installed executable: `codex-cli 0.144.1`.

Pinned source: OpenAI Codex tag `rust-v0.144.1`, commit `44918ea10c0f99151c6710411b4322c2f5c96bea`.

Accepted deterministic evidence:

- `/tmp/freeflow-phase3-codex-capability-proof-20260712.md` — SHA-256 `dcc370e86b7d224dd2646e258bc73fdb433e8fd99c3374da06ef19b1cb1576e6`
- `/var/folders/2x/tsrlzqfx3ld_fn5bmr1_3l600000gn/T/freeflow-codex-capability-dLlNhG/evidence/`

The accepted proof includes exact scripts, redacted config, commands, thresholds, positive network control, sandbox denial, child-process liveness, runner identity, and output accounting. All deterministic probes passed.

Capability reviews:

- `/tmp/freeflow-phase3-codex-capability-review-20260712.md` — SHA-256 `55fcf6fa635cc5f973855b2be97a29f709c1c3b4d215520c11ab25560d4ec85e`
- `/tmp/freeflow-phase3-codex-capability-review-20260712-pass2.md` — SHA-256 `b1f825b0cb3b0aa083db72b6ac98f063aca5dde4308d58c9556a5f4552d4a092`

Pass 1 found insufficient saved network/process evidence; the proof was rebuilt with reproducible controls and scripts. Pass 2 found the deterministic proof clean while confirming the paid-work boundary remained unsupported.

## Contract Review

The first contract review found undefined Codex provider semantics, incomplete null aggregation, and an unspecified portable tool/security mapping. Those findings were accepted and fixed with literal `openai` binding, whole-case null propagation, and immutable `codex-diagnostic-macos-v1` plus exact `read,write` compatibility.

Pass 2 found one process-boundary wording contradiction. The contract now permits only `codex --version` on public blocked routes. Pass 3 was clean.

- `/tmp/freeflow-phase3-codex-spec-review-20260712.md` — SHA-256 `5a654050707dc4c17f7f40a97027ba4c5d542cd1fd3274d61edd6f41566bee2d`
- `/tmp/freeflow-phase3-codex-spec-review-20260712-pass2.md` — SHA-256 `4fe715c301212f92d873326b8c50d7da14ab56531d720a9d511411e22c9665a0`
- `/tmp/freeflow-phase3-codex-spec-review-20260712-pass3.md` — SHA-256 `33693acc687d6afa9f9e1c31c07bdfce962b3dfea6925d58000cc92af87f9473`

## Implementation Verification And Review

Fresh deterministic suite: 126 tests passed, zero failures, skips, or cancellations.

Coverage includes option/host matrices, blocked public routes, literal provider and exact tool rejection, isolated config/auth/skill materialization, JSONL parsing, reasoning removal, lifecycle ordering, terminal evidence, nullable ledger behavior, fake end-to-end objective grading, timeout/output failures, diagnostic-only publication, and cleanup of isolated auth/config state.

- `/tmp/freeflow-phase3-full-tests-after-review-fixes-20260712.log` — SHA-256 `2bb7bbe08c44a5f5f8ff0f8dd292807b34ece01c1f3fc4e27e361334feaa41d0`

Implementation review pass 1 found one lifecycle-order blocker and missing Codex-specific fault/cleanup coverage. Both were fixed. Pass 2 was clean.

- `/tmp/freeflow-phase3-codex-implementation-review-20260712.md` — SHA-256 `a93ab194fce96468c4d87f3a9ac73e80e5f7274d829572c6fc3059fa4c56b329`
- `/tmp/freeflow-phase3-codex-implementation-review-20260712-pass2.md` — SHA-256 `1dc2e6791e80ee339c89cdee20a4dbfdd6bdb59368d86e3bd318917ef3a83e73`

## Status

Phase 3 is complete on the owner-selected reduced-fidelity route. The adapter is deterministic and publicly execution-blocked. Phase 4 may begin only through its local owning-spec review gate.
