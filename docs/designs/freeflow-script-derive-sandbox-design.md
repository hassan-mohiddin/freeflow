# Freeflow Script Derive Sandbox Design

> **Doc ID:** DESIGN-2026-06-23-freeflow-script-derive-sandbox
> **Date:** 2026-06-23
> **Owner:** Hassan Mohiddin
> **Type:** Architecture Design
> **Status:** Implemented for Pi JavaScript/Python/jq adapters through explicit package-root opt-in
> **Source:** `docs/specs/freeflow-observed-output-routing-vault-index-and-script-derive-design.md`, `docs/plans/2026-06-24-freeflow-observed-output-routing-vault-index-script-derive-implementation-plan.md`, current router source under `router/src/`, and output-router safety policy.

## Purpose

Define the sandbox and security contract for script-derived evidence.

This document is the sandbox contract, not approval for arbitrary code execution. JavaScript, Python, and jq now have Pi product adapter paths through explicit package-root opt-in. New languages, adapter families, raw-script persistence, network access, direct repo inputs, or materially different execution wrappers still require a follow-up plan, owner approval, and passing security/artifact review.

## Problem

Deterministic `freeflow_derive` operations cover common bounded transformations: regex filtering, counts, JSON extraction, grouping, dedupe, topN, URL/citation extraction, and stats.

Some future analysis may need custom logic over already-captured evidence. That logic is arbitrary code, which creates a different risk class:

- source evidence may contain secrets or adversarial content,
- scripts may try to read repo/home/env files,
- scripts may exfiltrate through network or DNS,
- scripts may write or delete files,
- scripts may consume unbounded CPU, memory, disk, or context,
- script output may bypass router caps or lose lineage.

Script derive must therefore be explicit, sandboxed, disabled by default, and isolated from deterministic derive execution paths even though it shares the public `freeflow_derive` tool.

## Design Decision

Public surface: keep one public `freeflow_derive` tool and add a clearly labeled sandboxed operation, `operation.kind="script"`.

There must be no separate public `freeflow_script_derive` tool. Deterministic derive operations and script derive share validation, status, routing, persistence, and lineage conventions, but dispatch to separate backend engines.

Rationale:

- The current source-truth spec chooses one public derive tool so agents do not learn two overlapping derive surfaces.
- `operation.kind="script"` makes arbitrary-code risk explicit at the call site.
- Deterministic operations can remain lightweight because script derive is disabled by default and rejected before sandbox execution unless explicitly enabled and supported.
- One tool keeps source resolution, lineage, output routing, and recovery behavior consistent.

Rejected defaults:

- Adding `freeflow_script_derive` as a separate public tool.
- Hiding script execution inside `freeflow_retrieve` or automatic retrieval. Existing evidence retrieval must stay read/query/recover-only.
- Falling back to unsandboxed host execution when a sandbox adapter is unavailable.

## Scope

In scope for a future first implementation:

- scripts derive from existing Freeflow vault records only,
- scripts run through a host sandbox adapter,
- script output is captured, vaulted when allowed, routed, and lineage-linked before entering model context,
- network is denied,
- filesystem access is limited to read-only mounted inputs and a scratch/output directory,
- no repo/home/env access is available to the script,
- exact recovery is promised only for captured output that was not truncated.

Out of scope:

- implementing script derive in this slice,
- direct repo-file reads from the script,
- mutating repo files or vault records from the script,
- package installation, dynamic imports, package managers, or dependency fetching,
- network access,
- long-running jobs,
- live provider calls from inside scripts,
- using script derive as a replacement for deterministic derive operations.

## Threat Model

Treat both the script and source evidence as untrusted.

Threats the first implementation must block:

- reading `.env`, SSH keys, tokens, shell history, home directories, repo files not explicitly mounted, or ambient env vars,
- writing outside the sandbox scratch/output directory,
- modifying source vault records,
- network/DNS exfiltration,
- importing host libraries or Node/Python runtime APIs that expose process, filesystem, child processes, or network,
- command execution outside the selected sandbox runtime,
- symlink escapes from input or output mounts,
- output flooding to exhaust disk/context,
- using nonzero exits or stderr to smuggle huge raw output into context,
- losing source lineage or operation hash after transformation.

Non-goal for v1: prove malicious native sandbox escape resistance across all platforms. If a host cannot provide a sandbox adapter that enforces this contract, script derive is unavailable.

## Module Boundary

Use a deep module split:

```text
public tool / host adapter
  -> script-derive core policy
    -> sandbox adapter
      -> isolated runtime
    -> vault/output router
```

Core owns:

- input validation,
- source recovery from vault,
- mount manifest creation,
- sandbox policy and limits,
- output capture semantics,
- routing, persistence, recoverability, failure contracts,
- lineage and operation hashing.

Sandbox adapter owns:

- platform-specific isolation mechanics,
- process/runtime launch,
- network denial,
- filesystem namespace/mounts,
- CPU/memory/wall-clock enforcement,
- cleanup of temp directories.

The adapter must be capability-probed. No adapter means structured `adapter_unavailable`, not fallback to unsandboxed execution.

## Proposed Input Shape

Draft shape for the future `freeflow_derive` script operation:

```json
{
  "sources": [
    { "kind": "vault", "outputId": "ffout_source", "stream": "combined", "alias": "test_log" }
  ],
  "operation": {
    "kind": "script",
    "language": "javascript",
    "code": "const log = readText('test_log'); writeText(log.split('\\n').filter(l => l.includes('ERROR')).join('\\n'));"
  },
  "limits": {
    "timeoutMs": 5000,
    "maxInputBytes": 1048576,
    "maxOutputBytes": 65536
  },
  "preserve": "important"
}
```

Compatibility rule: existing deterministic derive calls keep using the current single `source` plus deterministic `operation.kind` shape. `sources[]` is for script derive.

Validation rules:

- `sources[]` is one or more existing vault records; repo sources are not accepted in the first implementation.
- `alias` is required for every input and must match `^[A-Za-z][A-Za-z0-9_-]{0,63}$`.
- `stream` must be an existing stream for that source record.
- total mounted input bytes must be below `limits.maxInputBytes`.
- `operation.code` must be bounded before execution and must not be persisted raw by default.
- `operation.language` must be allowlisted by an available sandbox adapter.
- user-supplied limits may only tighten defaults unless explicit config permits larger bounds.
- disabled script derive returns structured disabled/unavailable output before source recovery or sandbox execution.

## Allowed Languages

Target language set for completion:

- JavaScript,
- Python,
- jq or an equivalent structured-data query language.

Each language remains unavailable until its sandbox adapter proves:

- no runtime APIs that expose ambient env, host filesystem, child processes, package loading, or network,
- no access to host globals beyond a tiny derive API or equivalent constrained input/output contract,
- deterministic text/JSON input helpers over mounted vault sources,
- output helpers that write only to captured stdout/output files,
- capability probes and adversarial isolation tests pass.

Node `vm` alone is not sufficient. A Node/Python subprocess without OS isolation is not sufficient. Shell is not allowed unless a future sandbox can prove the same isolation contract, and adding any other language requires adapter tests and review.

## Input Mounting Model

The core recovers source vault records into a fresh temp input directory controlled by Freeflow.

```text
/sandbox
  /input
    manifest.json
    test_log.txt
  /work
  /output
```

Rules:

- `/input` is read-only to the sandbox.
- each input file is a regular file created by Freeflow, not a symlink to the vault,
- `manifest.json` contains aliases, source `outputId`s, streams, byte counts, hashes, and media type when known,
- source vault paths are never mounted directly,
- no repo root, home directory, or package cache is mounted,
- environment variables are empty except adapter-required safe values that contain no secrets.

Scripts should access inputs through a tiny API or `/input/<alias>.txt`. They should not receive raw host paths outside the sandbox.

## Filesystem Permissions

The sandbox filesystem contract:

| Path | Permission | Notes |
| --- | --- | --- |
| `/input` | read-only | copied source evidence and manifest only |
| `/work` | read-write scratch | deleted after run; size-capped |
| `/output` | write-only or read-write | captured result files only |
| repo root | inaccessible | never mounted |
| vault root | inaccessible | never mounted |
| home directory | inaccessible | never mounted |
| env/secrets | inaccessible | no ambient env forwarding |

Symlinks created by the script are ignored when collecting output. Output collection reads only regular files under `/output` and captured stdout/stderr.

## Network Policy

Default and v1 policy: no network.

The sandbox adapter must deny:

- outbound TCP/UDP,
- DNS lookups,
- Unix socket access outside sandbox internals,
- package downloads,
- remote imports.

If the host cannot enforce no-network, script derive is unavailable.

Network-enabled script derive would require a separate security/privacy design and explicit owner approval.

## Time, Memory, Disk, And Output Limits

Default v1 limits:

| Limit | Default | Hard max without separate approval |
| --- | ---: | ---: |
| wall-clock timeout | 5s | 30s |
| CPU time | adapter-enforced, <= wall clock | 30s |
| memory | 128 MiB | 512 MiB |
| mounted input bytes | 1 MiB total | 10 MiB |
| script text bytes | 64 KiB | 256 KiB |
| stdout bytes | 64 KiB | router threshold or 1 MiB, whichever is lower |
| stderr bytes | 16 KiB | 128 KiB |
| output file bytes | 64 KiB total | router threshold or 1 MiB, whichever is lower |
| output files | 1 primary result | 8 files |

Output caps are hard safety caps, not just context caps. Router thresholds still control what enters model context after capture.

If output exceeds hard caps:

- stop the process when possible,
- persist only the bounded captured partial output if policy allows,
- mark execution as failed or partial,
- do not promise exact full recovery,
- return a structured failure with recovery instructions for any persisted partial content.

## Output And Routing

The script result is a new evidence record.

Allowed outputs:

- stdout as the primary text result, or
- `/output/result.txt`, or
- `/output/result.json` when declared by the script metadata.

The core captures raw script result before routing. The result then flows through the same bounded-evidence path as capture/derive output.

Every successful result exposes:

- producer kind `derive` plus operation metadata `kind=script` so script-derived records remain distinguishable without adding a second public tool surface,
- source output ids and record ids,
- sandbox adapter name/version,
- language/runtime,
- operation hash,
- routing status,
- persistence status,
- recoverability mode,
- recovery instructions when available.

## Failure Behavior

Script derive failures should use the same status separation as capture/derive:

- `toolStatus`: Freeflow tool itself handled the request,
- `deriveExecution.status`: `unavailable`, `rejected`, `failed`, `timed_out`, or `partial`,
- `routing.status`: whether any bounded evidence was produced,
- `persistence.status`: whether output/metadata was persisted,
- `recoverability`: exact, metadata-only, or none. `redacted` remains reserved/unsupported future work and must not be exposed as working script-derive recovery.

Required failure cases:

- sandbox adapter unavailable,
- language unsupported,
- source vault record unavailable,
- source input over cap,
- script text over cap,
- validation rejected unsafe config,
- timeout,
- memory/disk/output cap exceeded,
- nonzero exit,
- stderr-only failure,
- output missing,
- storage/vault failure,
- adapter reported policy violation.

A failed script must not cause native stderr/stdout to be dumped raw into context. Failure evidence is bounded and recoverable only according to persisted content.

## Lineage And Operation Hashing

`operationHash` must cover:

- source record ids and output ids,
- selected streams,
- source content hashes when available,
- script text hash,
- language and runtime version,
- sandbox adapter id/version,
- normalized limits,
- input manifest hash,
- declared output mode,
- Freeflow script-derive schema version.

Do not persist raw script text by default. Persist `scriptSha256`, language, a short caller-provided label when present, and the normalized policy. Raw script text may be persisted only after a separate opt-in design because scripts can contain secrets.

## Privacy And Storage

Default storage:

- source evidence remains in the existing vault,
- copied input temp files are deleted after execution,
- derived script output is vaulted when policy allows,
- script text is not stored raw by default,
- sandbox stderr is bounded and treated as diagnostic output, not a public log.

If the script output may contain secrets, the user should choose metadata-only/no-persistence policies in a future explicit design. Until those modes are implemented and tested for script derive, do not expose them as working config.

## Config And Status

Script derive is disabled by default.

Future config should be separate from deterministic derive, for example:

```json
{
  "scriptDerive": {
    "enabled": false,
    "sandbox": "auto",
    "languages": ["javascript", "python", "jq"],
    "network": "off"
  }
}
```

Setup must not enable script derive by default. `freeflow_status` should report:

- script derive enabled/off,
- sandbox adapter availability,
- allowed languages,
- network policy,
- effective limits,
- whether raw script persistence is disabled.

## Verification Requirements Before Implementation Ships

Minimum tests/evals:

- schema validation preserves deterministic `source` compatibility and accepts script `sources[]` only for `operation.kind="script"`,
- schema validation accepts only vault sources and allowlisted language,
- no fallback when sandbox adapter is unavailable,
- script cannot read env variables, repo files, home files, or vault files directly,
- script cannot write outside `/work` or `/output`,
- network attempts fail,
- symlink output escapes are ignored/rejected,
- timeout and memory/output caps produce structured failures,
- nonzero exit and stderr are bounded,
- successful output is vaulted and recoverable when exact,
- over-cap output does not promise exact full recovery,
- lineage contains source ids and operation hash,
- raw script text is not persisted by default,
- `freeflow_retrieve` has no script execution path,
- deterministic `freeflow_derive` operations continue to work without script policy,
- no public `freeflow_script_derive` tool is registered.

Useful adversarial eval fixtures:

- source evidence contains prompt-injection text instructing the agent to bypass Freeflow,
- script attempts `process.env`, `/etc/passwd`, repo `.env`, `$HOME/.ssh`, network fetch, and symlink output escape,
- script prints large stdout/stderr flood,
- script loops forever,
- script writes valid bounded result from a noisy log and preserves lineage.

## Implementation Gates

The initial Pi JavaScript/Python/jq implementation satisfied these gates through explicit package-root adapters. Apply the same gates before enabling any new language, adapter family, network mode, raw-script persistence mode, direct repo input mode, or materially different execution path:

1. Public API remains the current source-truth shape: one `freeflow_derive` tool with `operation.kind="script"`; no separate `freeflow_script_derive` registration.
2. A sandbox adapter exists for the target language and proves no-network/read-only-input/write-bounded-output behavior.
3. Script derive stays disabled by default and setup does not enable it implicitly.
4. Security/artifact review passes for this design or its approved successor.
5. Tests cover the verification requirements above.
6. Public docs state script derive is sandboxed, disabled by default, and separate from deterministic derive execution.
7. If no suitable sandbox exists, execution returns structured unavailable output with no unsandboxed fallback.

## Open Decisions

- Which Python sandbox adapter is acceptable?
- Should any raw script text ever be persisted for reproducibility, and under what explicit opt-in?
- Should script derive ever support repo-file inputs directly, or must repo content always be captured into vault first?
- Should metadata-only/no-persistence output modes ship for script derive outputs, or should exact output persistence under caps remain the only successful-output policy?
