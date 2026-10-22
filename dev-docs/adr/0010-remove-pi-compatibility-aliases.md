# ADR 0010: Remove Pi Compatibility Aliases

## Status

Accepted. Supersedes the compatibility-alias consequences in ADR 0005. Amended 2026-10-22: the rule now covers every removed or merged skill ([ADR 0014](0014-capability-skills-and-a-compact-core.md)), and it holds: no alias exists for any removed name, and `/discuss` itself became `/discuss-work`.

## Decision

Remove the Pi-only compatibility aliases `/discover` and `/execute-plan` from the active command surface.

Use the canonical commands instead:

- `/discuss`
- `/execute-work`

No compatibility registration, metadata entry, generated command, or active public documentation should preserve the removed aliases.

## Rationale

The aliases were transitional routes from the former `discover` and `execute-plan` identities. The current skill surface uses `discuss`, `track-work`, and `execute-work`, and keeping old aliases extends a command surface that no longer represents the supported model method names.

Removing them makes command metadata, runtime registration, documentation, and user guidance agree. Historical release evidence and superseded ADRs remain unchanged as provenance.

## Consequences

- Pi users must use `/discuss` and `/execute-work`.
- The active direct-command count decreases by two.
- Command-surface validation rejects future compatibility aliases.
- This is a consumer-visible removal recorded in the current `Unreleased` changelog; it does not change the underlying skill identities or host-native Codex/Claude invocation.
