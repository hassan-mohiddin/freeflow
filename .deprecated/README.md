# Deprecated

Historical Freeflow artifacts kept outside the active plugin runtime and npm package.

## Delegation Harness

- `delegation-harness/`: final implementation and development evidence, isolated from active Freeflow behavior.

## Output Router

- `output-router/`: retired Output Router implementation, Pi integration, capability guidance, tests, evaluations, and design history.

## Tool Execution v2

- `tool-execution-v2/`: the retired Freeflow execution runtime (programs, discovery, direct read/search/patch, capture, result reads, Session Store, accounting), its tests, validation scripts and guidance. Not an active runtime or package surface.

## Legacy Context Capabilities

- `legacy-context/`: historical source, prompts, capability skills and public docs, tests, and evaluation definitions for the removed Freeflow Context, Context Virtualization, and Conversation History features. This archive is not an active runtime or package surface.

## Router Experiments

- `router/experimental-local-index.ts`: historical local-index experiment.

## Documentation

- `project-docs/`: tracked archive of the former repository `docs/` tree, including historical ADRs, plans, handoffs, research, issues, guides, designs, and specifications.
- `codex-cli-agent-harness/`: historical Codex CLI and agent-runtime research.
- Legacy Output Router v0.4 plans, specs, issues, and handoffs now live under `output-router/docs/legacy-pi-v04/`.

## Skill Evaluations

- `skill-evals-v1/`: retired skill-evaluation cases, durable results, and harness machinery. Raw generated runs are intentionally omitted.
- `skill-tooling-pre-rewrite/`: documentary snapshot of the retired Write Skill authoring and Evaluate Skill evaluation system, including its scripts, tests, evidence, and superseded specs.

## Removed Modes

- `modes/`: former Mode Contract skill, evaluation definitions, and neutral subject preserved for historical reference only. The archive is not a supported runtime or package surface.

## Skills

- `skills/research-brief/`
- `skills/grill-context/`
- `skills/capture-decisions/`
- `skills/tdd/`: retired standalone test-first method and preserved evaluation definitions.

These discovery skills were replaced by the active `skills/discover/` skill. See `../plugin-docs/adr/0004-discover-replaces-shallow-discovery-skills.md`. The retired TDD package is historical only; current test-design guidance belongs to `skills/verify-work/references/test-design.md`.

## Claude Code Context

- `claude-code-context/claude-code-style.append.md`: an environment operating-style prompt drafted for appending to Claude Code's system prompt.
- `claude-code-context/claude-system-prompt-reconstruction.md`: Claude Code's full runtime context as reconstructed by the model on 2026-09-25 in this worktree; not a byte-exact export, with the user's email replaced by a placeholder.
