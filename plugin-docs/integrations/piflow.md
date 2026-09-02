# PiFlow Integration

PiFlow is a separate coding-agent distribution and host repository. Freeflow supplies workflow policy, prompt fragments, skills, capabilities, and its Pi extension. PiFlow owns its host launch, session state, package installation, import, updates, and native model-state controls; normal Pi supplies the corresponding official APIs directly.

## When to use PiFlow

Use either Pi or PiFlow for Freeflow’s shared skills, prompt delivery, Context Virtualization, Conversation History, and Cognitive Routing. PiFlow remains a supported host when its host-owned lifecycle and model-state controls are preferred.

## Install PiFlow and Freeflow

Install the released PiFlow distribution:

```bash
npm install -g --ignore-scripts @hassangameryt/piflow
```

Then install Freeflow into PiFlow:

```bash
piflow install npm:@hassangameryt/freeflow
```

For a Git-based package source:

```bash
piflow install git:github.com/hassan-mohiddin/freeflow
```

Use `-l` when the package should be recorded in project-local PiFlow settings instead of the user settings. Review third-party package source before installation; PiFlow packages can run extensions with the host’s system permissions.

See the [PiFlow repository](https://github.com/hassan-mohiddin/piflow) for PiFlow installation, package management, project trust, state directories, and host release guidance.

## Activate and configure

In the target repository, run:

```text
/setup-freeflow
```

Then open `/freeflow` and enable Cognitive Routing. Configure distinct `standard` and `reasoning` profiles with authenticated provider/model pairs. Profiles may be supplied through the shared repository configuration or the personal checkout layer according to the normal Freeflow configuration precedence.

A Cognitive Routing profile must resolve to an available and authenticated model with a supported thinking level. Identical effective profiles, missing profiles, unavailable models, failed authentication, or weakened thinking levels leave routing unavailable rather than partially active on either host.

## Profile controls

Profile changes are available while Pi or PiFlow is idle:

```text
/freeflow profile standard
/freeflow profile reasoning
/freeflow profile auto
/freeflow profile history
/freeflow profile history active
/freeflow profile history anomalies
```

- `standard` and `reasoning` place a manual hold on the selected profile.
- `auto` releases the manual hold and returns to automatic Reasoning control.
- `history` commands inspect transition evidence without changing routing state.

### Keyboard shortcuts

While either host is idle:

- `Ctrl+Shift+R` cycles the manual standard/reasoning hold.
- `Ctrl+Shift+A` sets automatic Reasoning control. When a manual hold is active, it releases the hold and moves to Reasoning when necessary; pressing it again is idempotent.

Both hosts use the same Cognitive Routing skill, profile tool, controls, and transition history. A host without the required model-state APIs leaves routing unavailable.

Under automatic control, each new user interaction begins in Reasoning. Conversational Reasoning is the default and needs no route marker; all user-facing interpretation, discussion, decisions, questions, assessment, and reporting remain there. For authorized execution, Reasoning chooses Yield for a complete ordinary result, Delegate for Standard execution under an open model-written boundary, or Act Bounded for exceptional direct execution when judgment and action are materially inseparable. Standard only executes active Yield or Delegate contracts and never conducts substantive user-facing interaction. At every return condition, it transfers state with `YIELD HANDOFF` or `RETURN` to Reasoning, which handles user-facing interpretation, questions, discussion, assessment, and reporting. Yield hands back to Reasoning; Delegate returns evidence while its boundary remains open until Reasoning closes it. Cognitive Routing changes compute placement only and does not change the current Workflow owner, authority envelope, task scope, or verification requirements.

## Ownership boundary

| Responsibility | Owner |
| --- | --- |
| Workflow policy, skills, prompt fragments, capability behavior, and Freeflow package snapshots | Freeflow |
| Host launch, package installation, session state, import, updates, and native model-state control | The active Pi or PiFlow host |
| Repository activation and personal overrides | The Freeflow configuration in the target repository |

PiFlow development and released PiFlow are separate invocations. Freeflow development snapshots are not production releases and do not establish package version precedence.

## Development and clean installs

For Freeflow development, refresh a snapshot only from a committed Freeflow revision:

```bash
cd /path/to/freeflow
npm run snapshot:refresh
```

Use the PiFlow development launcher or a released PiFlow host with temporary state and package-cache roots for clean-install checks. Do not delete official Pi, PiFlow, credential, session, or rollback state to manufacture a clean result.

## Troubleshooting

- **Cognitive Routing is unavailable:** confirm Freeflow is enabled, profiles and authentication are valid, and the host exposes its required model-state APIs.
- **Profiles are unavailable:** check provider authentication, model identifiers, thinking levels, and whether the two profiles resolve to distinct effective pairs.
- **Profile changes are rejected:** the active Pi or PiFlow host must be idle before settings or profile changes are applied.
- **A package update is not visible:** use the active host’s package update/reload behavior or restart it at its native lifecycle boundary.

## Related documentation

- [Pi integration](pi.md)
- [Freeflow architecture](../architecture.md)
- [Workflow](../workflow.md)
- [PiFlow repository](https://github.com/hassan-mohiddin/piflow)
