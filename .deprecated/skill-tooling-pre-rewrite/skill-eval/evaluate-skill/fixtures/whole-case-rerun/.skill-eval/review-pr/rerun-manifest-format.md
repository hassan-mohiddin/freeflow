# Rerun Manifest

Write `.skill-eval/review-pr/rerun.json` with:

- `case_id`: the case being rerun;
- `scope`: `whole-case` or `candidate-only`;
- `reuse_partial`: whether settled evidence from the incomplete attempt will be reused;
- `variants`: the variants the next invocation will execute;
- `reason`: a concise explanation of the safe rerun boundary.
