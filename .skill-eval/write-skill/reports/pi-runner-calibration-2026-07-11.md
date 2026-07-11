# Pi Runner Calibration — WSK2-003

Date: 2026-07-11

Status: Pass after two infrastructure corrections

## Contract

- Case: `WSK2-003`
- Evidence class: native activation
- Variant: v2 candidate snapshot
- Provider/model: `openai-codex/gpt-5.5`
- Thinking: `high`
- Tools: `read`
- Expected objective evidence: the exact `write-skill` snapshot is read

## Manual Direct Pi

Evidence: `.skill-eval/write-skill/runs/manual-20260711T062645Z-wsk2-003-candidate/`

- Exit: 0
- Provider requests: 2
- Tool calls: 1
- Exact skill read: yes
- Snapshot immutable: yes
- Tokens: 3,099
- Cost: $0.034770
- Raw JSONL: about 6 MiB

The first manual attempt used a conventional `--` argument separator that Pi 0.80.6 does not accept. It made no provider request and is preserved as infrastructure evidence under `manual-20260711T062519Z-wsk2-003-candidate/`.

## V2 Runner

Wave: `.skill-eval/write-skill/runs/waves/20260711062724711-write-skill-79833/`

Accepted run: `.skill-eval/write-skill/runs/20260711063148209-wsk2-003-candidate-r2-ea043fc9/`

- Exit: 0
- Provider requests: 2
- Tool calls: 1
- Exact skill read: yes
- Snapshot immutable: yes
- Objective grade: pass
- Tokens: 3,734
- Cost: $0.049495
- Raw JSONL: about 13 MiB

The initial runner hard output cap was 1 MiB. Pi JSON message-update events exceeded it despite a healthy two-turn job, so the runner preserved two hard-limit attempts and entered `needs_attention`. The cap was raised to 32 MiB, the pending job received a new fingerprint, and the same frozen wave resumed successfully.

## Agreement

Manual and runner executions agree on:

- natural prompt;
- candidate snapshot hash;
- host, model, thinking, and tools;
- two provider requests;
- one `read` tool call targeting the exact `SKILL.md` snapshot;
- immutable snapshot;
- successful native-activation verdict.

Final wording and token usage varied, as expected. Both responses gave the same substantive boundary: incident handoff authoring should activate for transfer-of-context work and not for debugging, postmortems, or status updates.

## Calibration Decision

The Pi one-shot adapter is accepted for further bootstrap cases with:

- no `--` separator before the prompt;
- hard-limit failures requiring explicit retry rather than automatic identical repeats;
- soft request/spend caps still checked between jobs;
- frozen wave resume preserving completed evidence and changing the fingerprint when hard limits change.

Follow-up evidence from the multi-tool `WSK2-001` pressure case showed that 32 MiB was still too small for Pi JSON message-update events under `gpt-5.5/high`: a healthy five-request job reached the cap before writing its artifact. The default raw stream cap is therefore 128 MiB. This remains a protocol-stream safety bound, not a model-token budget.
