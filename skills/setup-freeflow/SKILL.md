---
name: setup-freeflow
description: Use when installing or configuring Freeflow in a repository, repairing `.freeflow/config.json`, changing the repo default mode during setup, opting into Output Router or Delegation Harness setup, or checking whether the current host can load Freeflow runtime context.
---

# Setup Freeflow

Make `.freeflow/config.json` the only repo activation boundary. Runtime adapters load the compact kernel; setup does not copy Freeflow instructions into repo-owned host files.

Read [the activation contract](references/activation-contract.md) before changing setup state. Read [host setup](references/host-setup.md) when runtime delivery or host trust is in question.

Read [output-router setup](references/output-router-setup.md) only when the user asks for Output Router, observed routing, script transform, native safety-net routing, generated-path hints, thresholds, vault config, or Delegation Harness config, or accepts the optional capabilities branch.

## Inspect

Before editing:

1. inspect `.freeflow/config.json`;
2. inspect existing repo instructions only for source conflicts that would change setup behavior;
3. identify the current/requested host when runtime verification depends on it;
4. check whether that host's Freeflow adapter is available and trusted when the host exposes such evidence.

A valid config means repo setup is present. Host instruction files do not activate Freeflow.

Stop before replacing invalid config or resolving conflicting setup instructions. Those are source-truth decisions.

## Configure

For a new default setup, write:

```json
{
  "defaultMode": "workflow"
}
```

Use `conversation` or `strict-workflow` only when explicitly requested as the repo default. Preserve valid existing capability settings unless the user asked to change them. Do not add unrequested config keys or empty optional sections.

Do not create or append a Freeflow block in `AGENTS.md`, an import in `CLAUDE.md`, or `.claude/rules/freeflow-core.md`.

## Optional Capabilities Branch

After minimal config setup, ask one optional capabilities question: whether to enable Output Router, configure its subfeatures, or enable Delegation Harness during setup.

If declined, keep minimal config. If accepted or explicitly requested, use [output-router setup](references/output-router-setup.md), ask only path-changing follow-ups, and write only the selected capability config. Verify with `freeflow_status` when available. Do not require a second slash command after the user chooses setup capabilities.

Output Router and Delegation Harness remain disabled by default. Never enable observed routing, native safety-net routing, Delegation Harness, or script transform without explicit opt-in. Script-transform adapter installation requires explicit consent and successful sandbox proof probing; report probe failures instead of claiming a language is enabled.

## Activate This Session

After writing config, read `../decision-gate/references/runtime-kernel.md` and apply it for the rest of the current setup turn/session. Read `../output-router/SKILL.md` or `../delegation-harness/SKILL.md` when that capability is effective after setup, whether newly enabled or preserved from valid config. Do not paste runtime context into a host instruction file.

If the host loads runtime context only at session lifecycle boundaries, tell the user to start, resume, clear, or compact as appropriate before relying on automatic injection. Report capability context as loaded only when its enabled skill body was read successfully.

## Verify And Report

Verify:

- `.freeflow/config.json` parses and has a valid `defaultMode`;
- minimal config contains only `defaultMode` unless optional capabilities were accepted, explicitly requested, or already valid;
- capability config contains only requested valid keys;
- Output Router, Delegation Harness, observed routing, native safety-net routing, and script transform remain off unless explicitly requested and supported;
- every enabled observed-routing producer has user-chosen persistence as required by [output-router setup](references/output-router-setup.md);
- no setup step created or modified Freeflow instructions in repo-owned host files;
- no unrelated files changed;
- runtime delivery is **confirmed**, **unavailable**, or **unconfirmed** for the current/requested host.

Report repo activation separately from runtime delivery. Never imply that a valid config proves a Codex or Claude hook ran.

If the adapter is unavailable or its trust/registration cannot be verified, make that visible and name the host-specific reload, install, trust, or diagnostic step needed. Do not silently call setup complete at runtime.
