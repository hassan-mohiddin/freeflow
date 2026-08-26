# PiFlow Integration

PiFlow is a separate coding-agent distribution and host repository. Freeflow supplies workflow policy, prompt fragments, skills, capabilities, and its Pi extension. PiFlow owns host launch, session state, package installation, import, updates, and the model-state controls used by Cognitive Routing.

## When PiFlow is required

Use normal Pi for Freeflow’s shared skills, prompt delivery, Context Virtualization, and Conversation History.

Use PiFlow when you need Cognitive Routing. The Freeflow extension checks for the PiFlow host contract before activating routing. Installing Freeflow into normal Pi does not enable it.

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

A Cognitive Routing profile must resolve to an available and authenticated model with a supported thinking level. Identical effective profiles, missing profiles, unavailable models, failed authentication, or weakened thinking levels leave routing unavailable rather than partially active.

## Profile controls

Profile changes are available while PiFlow is idle:

```text
/freeflow profile standard
/freeflow profile reasoning
/freeflow profile auto
/freeflow profile history
/freeflow profile history active
/freeflow profile history anomalies
```

- `standard` and `reasoning` place a manual hold on the selected profile.
- `auto` releases the manual hold and returns to automatic control.
- `history` commands inspect transition evidence without changing routing state.

### Keyboard shortcuts

While PiFlow is idle:

- `Ctrl+Shift+R` cycles the manual standard/reasoning hold.
- `Ctrl+Shift+A` cycles the automatic standard/reasoning profile. When a manual hold is active, its first press releases the hold and returns to automatic control without forcing a profile transition.

These shortcuts are available only in PiFlow. Normal Pi does not register Cognitive Routing shortcuts.

Under automatic control, Cognitive Routing changes compute placement only. It does not change the current Workflow owner, authority envelope, task scope, or verification requirements.

## Ownership boundary

| Responsibility | Owner |
| --- | --- |
| Workflow policy, skills, prompt fragments, capability behavior, and Freeflow package snapshots | Freeflow |
| Host launch, package installation, session state, import, updates, and model-state lease/control | PiFlow |
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

- **Cognitive Routing says PiFlow only:** the package is running in normal Pi; install and run it through PiFlow.
- **Cognitive Routing is inactive:** confirm Freeflow is enabled and its own configuration, profiles, authentication, and host controls are valid.
- **Profiles are unavailable:** check provider authentication, model identifiers, thinking levels, and whether the two profiles resolve to distinct effective pairs.
- **Profile changes are rejected:** PiFlow must be idle before settings or profile changes are applied.
- **A package update is not visible:** use PiFlow’s package update/reload behavior or restart the host at its native lifecycle boundary.

## Related documentation

- [Pi integration](pi.md)
- [Freeflow architecture](../architecture.md)
- [Workflow](../workflow.md)
- [PiFlow repository](https://github.com/hassan-mohiddin/piflow)
