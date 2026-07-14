# Sandbox Permissions

`SandboxPermissions` is a per-command request shape.

Plain-language meaning:

```text
UseDefault:
  Run with the turn's normal sandbox.

RequireEscalated:
  Request unsandboxed execution.

WithAdditionalPermissions:
  Stay sandboxed but widen permissions for this one command.
```
