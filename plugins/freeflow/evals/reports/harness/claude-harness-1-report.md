# Claude Harness Report 1

Date: 2026-05-25

## Change

Added:

```text
plugins/freeflow/evals/scripts/run-claude-fixture-eval.sh
```

Updated:

```text
plugins/freeflow/evals/scripts/run-fixture-eval-by-id.sh
plugins/freeflow/evals/runbooks/fixture-eval-runbook.md
```

## Behavior

The ID runner now selects the fixture agent with:

```sh
FREEFLOW_FIXTURE_AGENT=codex
FREEFLOW_FIXTURE_AGENT=claude
```

Default remains Codex.

Claude runner defaults:

- `baseline`: no plugin dir.
- `with-skill`: `--plugin-dir plugins/freeflow`.
- portable evals: `--bare`, `--no-session-persistence`, `--permission-mode dontAsk`, `--tools Read,Edit,Bash`, `--add-dir "$run_dir"`.
- host-memory evals: set `FREEFLOW_CLAUDE_BARE=0` so `CLAUDE.md` and imports are discoverable.

The runner saves final output, stderr, exit status, diff, and git metadata when the run fixture is a git repo.

## Dry-Run Evidence

Claude baseline resolution:

```text
agent=claude
runner=.../run-claude-fixture-eval.sh
variant=baseline
plugin_dir=none
```

Claude portable with-skill command construction:

```text
bare=1
plugin_dir=.../plugins/freeflow
command=claude -p --no-session-persistence --permission-mode dontAsk --tools Read,Edit,Bash --add-dir ... --bare --plugin-dir ... <prompt>
```

Claude host-memory command construction:

```text
bare=0
plugin_dir=none
command=claude -p --no-session-persistence --permission-mode dontAsk --tools Read,Edit,Bash --add-dir ... <prompt>
```

Codex default still resolves to `run-codex-fixture-eval.sh`.

## Smoke Result

Attempted:

```sh
FREEFLOW_FIXTURE_AGENT=claude \
  plugins/freeflow/evals/scripts/run-fixture-eval-by-id.sh \
  FX-004 baseline fx-004-claude-baseline plugins/freeflow/evals/runs/fx-004-claude-baseline-output.md
```

Result: blocked by local Claude auth.

Saved output:

```text
Not logged in · Please run /login
```

Saved exit status:

```text
1
```

Diff was empty because the model did not run.

## Next

After Claude auth is available for the chosen mode, run one paired smoke:

- `FX-004 baseline`
- `FX-004 with-skill`

Then run one host-memory eval with `FREEFLOW_CLAUDE_BARE=0`, preferably `AON-001`, to verify `CLAUDE.md` import behavior.

