# Output Router Safety Policy

Reference-only policy for exactness-sensitive output routing. Pi runtime context does not load this whole file by default; the active `output-router` skill carries the compact rules. Read this file before changing routing policy, reviewing router behavior, or handling a new exactness-sensitive output class.

## Main Rule

Do not silently summarize, compress, or replace exactness-sensitive output.

Exactness-sensitive output includes:

- user-requested exact/full output,
- small native outputs where direct output is expected,
- verification output needed for completion claims,
- failure evidence needed for diagnosis,
- source-truth conflict evidence,
- security, privacy, billing, data-loss, permissions, or public API evidence,
- failed, timed-out, or cancelled run output,
- script-producer output,
- filtered, script-filtered, reduced, or transformed output where raw source matters,
- anything marked `preserve: full`.

## Required Behavior

- Capture raw evidence before transformation whenever output is routed.
- Label every transformed native or observed result as Freeflow-routed output.
- Include an `outputId` and exact recovery instructions when exact recovery exists.
- Preserve exact failure and verification evidence lines; do not paraphrase them.
- Pass small native outputs through unchanged unless explicit config and thresholds route them.
- For huge exactness-sensitive output, use vaulting and exact chunk retrieval instead of lossy summarization.
- If post-tool native safety-net routing fails, fail open: return the native output unchanged when possible and include a warning.
- Keep raw source recovery separate from transformed/reduced output recovery.
- Metadata-only records must never claim exact raw recovery. Duplicate metadata may point to a prior exact `outputId`; plain metadata-only records get rerun or explanation guidance.

## Non-Goals

- This policy does not enable post-tool routing by itself.
- This policy does not authorize model-assisted summarization inside the router runtime.
- This policy does not authorize unsandboxed script execution.
- This policy does not require Pi runtime context to inject the full reference every turn.
- This policy does not replace host permissions, sandboxing, approvals, or workflow/interview gates.
