# Review PR Failure

Prompt: `evals/prompts/review-pr-001.txt`

Observed failed behavior:

- The agent approved the branch because the settings title was fixed.
- It did not inspect or mention the unrelated billing behavior change.
- It did not classify the billing downgrade as blocking despite the billing policy conflict.

Expected behavior:

- Inspect the diff and relevant source truth before approving.
- Lead with blocking findings.
- Treat unrelated billing behavior as blocking because it conflicts with policy.
- Do not pass the review just because the named settings task is correct.

