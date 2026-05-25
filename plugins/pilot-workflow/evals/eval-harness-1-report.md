# Pilot Workflow Eval Harness Report - 1

Date: 2026-05-25

## Question

Is the current fixture-eval method the best way to evaluate skills?

Answer: keep paired fixture evals, but make the harness cheaper before adding `evaluate-skill`.

## Change

Added:

```text
plugins/pilot-workflow/evals/scripts/run-fixture-eval-by-id.sh
```

The script resolves evals from `fixture-evals.json` and delegates to the existing Codex fixture runner.

Important behavior:

- `baseline` uses `baseline_fixture_root` when present.
- Other variants use `fixture_root`.
- `prompt_file` and inline `prompt` entries both work.
- `PILOT_WORKFLOW_DRY_RUN=1` prints the resolved run without launching a nested model.

This makes `baseline_fixture_root` executable harness behavior instead of hand-written report convention.

## Dry-Run Evidence

`AON-001 baseline` resolves to the pre-setup fixture:

```text
fixture=.../plugins/pilot-workflow/evals/fixtures/tiny-saas-app
```

`AON-001 with-core` resolves to the post-setup fixture:

```text
fixture=.../plugins/pilot-workflow/evals/fixtures/tiny-post-setup-source-conflict-app
```

`FX-001 baseline` resolves its inline registry prompt without creating a dry-run temp file:

```text
prompt=<inline prompt from registry>
```

## Evaluation Method Decision

The most token-efficient reliable pattern is:

1. Use dry-run to confirm fixture, prompt, variant, output path, and skills.
2. Run the smallest paired model eval that can expose the failure.
3. Grade file behavior from diffs and filesystem checks first.
4. Read final responses only for reasoning claims that diffs cannot prove.
5. Rerun only the failed side after skill wording changes.

Do not replace fixture evals with pure model judgment. That is cheaper at first but weaker: the model can miss actual file edits or believe polished final responses.

Do not use full transcript review by default. It is expensive and usually unnecessary once final response, diff, status, and targeted checks are saved.

## Claude Shape

For portable Claude skill/plugin evals:

```sh
claude -p \
  --bare \
  --no-session-persistence \
  --permission-mode dontAsk \
  --tools Read,Edit,Bash \
  --add-dir "$run_dir" \
  --plugin-dir plugins/pilot-workflow \
  "$prompt"
```

For Claude host-memory evals, do not use `--bare`; it skips normal memory discovery. Use normal startup so `CLAUDE.md` and imports are tested.

## Recommendation For `evaluate-skill`

Teach the skill to turn real failures into fixture evals:

- Preserve the failing prompt.
- Build the smallest fixture that reproduces the wrong behavior.
- Add or update registry metadata.
- Dry-run the eval ID before spending model tokens.
- Run baseline versus with-skill.
- Prefer diff/assertion evidence over transcript interpretation.
- Tighten skill wording only after the failure is measured.
