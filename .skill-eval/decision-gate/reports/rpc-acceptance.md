# Fixed-Script Pi RPC Acceptance

> Internal engineering evidence only. This does not make `write-skill`, `evaluate-skill`, or `decision-gate` Production-Ready. The developer skills remain Unverified.

## Supported Statement

The evaluator is verified for fixed, predeclared two-turn Pi RPC execution with Pi `0.80.6`, `openai-codex/gpt-5.5`, and high thinking for the two Phase 2 acceptance cases below.

The evidence supports one isolated RPC process per subject variant, ordered prompt acceptance and `agent_settled`, state continuity without cross-variant leakage, frozen per-turn workspace evidence, one shared semantic turn scope, bounded canonical transcripts, whole-case publication, and fresh bundle-integrity verification.

It does not support adaptive follow-ups, session resume, shared sessions, batching, concurrency, cache, partial reuse, a global provider-request hard cap, another model or Pi version, Codex CLI execution, or a model-independent readiness claim.

## Accepted Results

| Case | Result | Processes | Requests | Tokens | Cost |
| --- | --- | ---: | ---: | ---: | ---: |
| `DG2-001` synthetic state/isolation comparison | `same`; both variants passed all four objective assertions | 2 subject, 0 semantic | 6 | 5,755 | `$0.034075` |
| `DG2-002` real `decision-gate` flow | `pass`; four objective and one semantic assertion passed | 1 subject, 1 semantic | 8 | 15,664 | `$0.072614` |
| **Accepted total** |  | **4** | **14** | **21,419** | **`$0.106689`** |

Bundles:

- `.skill-eval/decision-gate/runs/evaluations/20260711191613370-dg2-001-93d3e65f3e/result.json`
- `.skill-eval/decision-gate/runs/evaluations/20260711191700932-dg2-002-66122b1b86/result.json`

Fresh verification established:

- both integrity inventories match;
- all accepted assertions pass with no unavailable evidence or residual uncertainty;
- `DG2-001` retains the distinct alpha and beta tokens on both turns, reads each skill only on turn 1, and retains no hidden reasoning;
- `DG2-002` changes no file before the owner decision, changes only `config/rollout.json` afterward, and its semantic packet contains exactly `turn-1` and `turn-2` without role identity;
- every transcript byte count equals its reported retained-output count and remains below the approved 8 MiB public limit;
- no accepted process reports protocol failure.

## Deterministic And No-Provider Evidence

- Full deterministic suite: 112 tests passed, zero failures, skips, or cancellations.
- Installed-Pi doctor: Pi `0.80.6`; RPC JSONL and multi-turn capabilities available; ready for RPC planning; zero model requests.
- Fault injection covers correlation, rejected or mismatched responses, malformed or non-LF-terminated JSONL, premature EOF, missing settlement, forbidden lifecycle events, timeout, abort, process-tree cleanup, retained-output and raw-transport limits, and canonical-transcript overflow before a later prompt.

Logs:

- `/tmp/freeflow-phase2-rpc-final-full-tests-20260711.log` — SHA-256 `661c8d4a020f87e5ff8bd77150d5c9c3085266f175dc38aa07f323fb33a7499c`
- `/tmp/freeflow-phase2-rpc-final-doctor-20260711.json`

## Review

The first implementation review accepted the behavioral, isolation, semantic, atomicity, and integrity evidence but found two trust gaps: non-LF-terminated valid JSON was accepted, and complete canonical transcripts were not charged to the public retained-output limit. Both findings were accepted and fixed.

The first follow-up confirmed LF framing and honest final byte accounting, then found that `skill_read` was added after the pre-next-prompt size check. That finding was accepted and fixed by making `skill_read` part of each turn before serialization and by adding a two-turn overflow test proving that only the first prompt starts.

The final narrow review was clean.

Review artifacts:

- `/tmp/freeflow-phase2-rpc-implementation-review-20260711.md` — SHA-256 `57ebc4ee27e7ce9c9ad7bfb7187f412abf24a05ebfcf14dcf3b3e5639c42c7ae`
- `/tmp/freeflow-phase2-rpc-implementation-review-20260711-pass2.md` — SHA-256 `383d3d595f75f641365e01f18defba6aa30217000e7a4dd65d9ef70cfc30aaec`
- `/tmp/freeflow-phase2-rpc-implementation-review-20260711-pass3.md` — SHA-256 `3d10e7629796ad25b9b91fcb69f1533b863637274f80133ebc8bb168af943645`

## Developmental Runs

Phase 2 used nine whole-case paid invocations totaling `$0.469862`, including exploratory failures and mandatory whole-case reruns after case or evaluator changes. Only the two final bundles above support the accepted statement. No partial result, resumed session, or cached model output was reused.
