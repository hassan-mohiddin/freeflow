# Output Router Safety Policy

Use this reference for exactness-sensitive output routing.

## Main Rule

Do not silently summarize or compress exactness-sensitive output.

Exactness-sensitive output includes:

- user-requested exact/full output,
- small outputs,
- verification output needed for completion claims,
- failure evidence needed for diagnosis,
- source-truth conflict evidence,
- security, privacy, billing, data-loss, or public API evidence,
- anything marked `preserve: full`.

## Required Behavior

- Capture raw evidence before transformation whenever output is routed.
- Label every transformed native result as Freeflow-routed output.
- Include an `outputId` and exact recovery instructions for routed output.
- Preserve exact failure and verification evidence lines; do not paraphrase them.
- Pass small native outputs through unchanged.
- For huge exactness-sensitive output, use vaulting and exact chunk retrieval instead of lossy summarization.
- If post-tool safety-net routing fails, fail open: return the native output unchanged when possible and include a warning.

## Non-Goals

- This policy does not enable post-tool routing by itself.
- This policy does not authorize model-assisted summarization inside the router runtime.
- This policy does not require existing Freeflow skills to depend on the router runtime.
