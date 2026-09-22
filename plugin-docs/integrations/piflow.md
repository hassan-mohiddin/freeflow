# PiFlow Integration

PiFlow is a separate coding-agent distribution and host repository. Freeflow supplies workflow policy, prompt fragments, skills, capability source, and its Pi extension; PiFlow owns host launch, package installation, session state, import, and updates.

## Current Cognitive Routing and Tool Execution status

The redesigned `cognitive-routing-v2` adapter and Tool Execution are explicitly unavailable for an identified PiFlow host in the current Freeflow source entrypoint. This page does not claim PiFlow Cognitive Routing support, complete host integration, native model-state control, or model evaluation. Installing PiFlow or Freeflow does not change that gate.

Freeflow's shared skills and ordinary package surface may still be used through PiFlow's own host lifecycle. Treat Cognitive Routing and Tool Execution as unavailable until separately qualified PiFlow adapters and installed-host evidence exist.

## Install PiFlow and Freeflow

Install PiFlow separately:

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

Use `-l` when the package should be recorded in project-local PiFlow settings instead of user settings. Review third-party package source before installation; PiFlow packages can run extensions with the host's system permissions.

See the [PiFlow repository](https://github.com/hassan-mohiddin/piflow) for PiFlow installation, package management, project trust, state directories, and host release guidance.

## Activate Freeflow

In the target repository, run:

```text
/setup-freeflow
```

This creates the shared `.freeflow/config.json` activation boundary. Minimal activation is `{}`. `.freeflow/local.json` is an optional personal override and cannot activate Freeflow by itself.

Do not add or change Cognitive Routing or Tool Execution configuration merely to make the current PiFlow adapter activate it. The active routing schema and operating reference belong to the native [Pi integration](pi.md) and [Cognitive Routing](../capabilities/cognitive-routing.md) pages; they do not establish equivalent PiFlow support. A future PiFlow adapter must qualify its own host controls, lifecycle, configuration delivery, and installed behavior before this page publishes setup instructions.

On the current PiFlow path, `/freeflow` should report Cognitive Routing and Tool Execution unavailable rather than partially applying them. A repository configuration that is also used by native Pi does not become PiFlow support simply because PiFlow can read the package.

## Ownership and evidence boundary

| Responsibility | Owner |
| --- | --- |
| Workflow policy, skills, prompt fragments, capability behavior, and Freeflow package snapshots | Freeflow |
| Host launch, package installation, session state, import, and updates | PiFlow |
| Repository activation and personal overrides | Freeflow configuration in the target repository |
| PiFlow Cognitive Routing and Tool Execution availability | Current Freeflow source gates; currently unavailable |

A development snapshot identifies a committed Freeflow revision; an installed package and the PiFlow host are separate identities. Refreshing a snapshot does not patch a host, `fsync` a session, or promise exactly-once delivery. PiFlow owns host synchronization, while Freeflow's native routing events and saved reports—when a qualified adapter exists—remain distinct from host package state.

## Development and clean installs

For Freeflow development, refresh a snapshot only from a committed Freeflow revision:

```bash
cd /path/to/freeflow
npm run snapshot:refresh
```

Use the PiFlow development launcher or a released PiFlow host with temporary state and package-cache roots for clean-install checks. Do not delete official Pi, PiFlow, credential, session, or rollback state to manufacture a clean result. These development practices do not make the current PiFlow routing adapter available.

## Troubleshooting

- **Cognitive Routing or Tool Execution is unavailable:** this is expected on the current PiFlow adapter path. Do not work around it by impersonating a profile, invoking hidden operations, or editing host state.
- **Freeflow is not delivered:** verify PiFlow's native package installation, project trust, reload, and session lifecycle using PiFlow documentation. Installation alone is not delivery evidence.
- **Cognitive Routing remains unavailable despite valid native-Pi configuration:** this is expected on the current PiFlow adapter. Do not rewrite the configuration or copy another schema to bypass the host gate.
- **A package update is not visible:** use PiFlow's native update/reload behavior or restart it at its lifecycle boundary; do not infer the installed identity from a different checkout or snapshot.

## Related documentation

- [Cognitive Routing](../capabilities/cognitive-routing.md)
- [Tool Execution](../capabilities/tool-execution.md)
- [Pi integration](pi.md)
- [Freeflow architecture](../architecture.md)
- [Getting Started](../getting-started.md)
- [Workflow](../workflow.md)
- [PiFlow repository](https://github.com/hassan-mohiddin/piflow)
