# ADR 0003: Release Boundary

## Status

Accepted. Amended 2026-09-04.

## Decision

Freeflow ships as a marketplace repository with one source tree under the repo root.

The GitHub repository includes the canonical 25-skill tree, bundled references, shared prompt sources, host-specific context-loading adapters/manifests, public docs, current `.skill-eval/` definitions, deprecated historical evaluations, command-surface metadata, Codex/Claude metadata, Agent Plugins/Gemini/Cursor/Copilot metadata, and Pi package metadata/extension. Retired Output Router evidence is preserved under `.deprecated/output-router/`.

The npm tarball is the installable runtime artifact. It includes the canonical `skills/` tree, shared prompt sources, host-specific hook adapters/manifests, runtime-required capability sources, and the Pi extension. It excludes GitHub-only `plugin-docs/`, `.skill-eval/`, `.deprecated/`, project-development docs and plans, generated evaluation output, historical background notes, handoffs, enforcement hooks, CLI tools, and old Orchestra compatibility.

## Rationale

The public repository should keep documentation and evidence beside the skills they explain and protect. npm installations need executable runtime resources, not repository evidence or documentation copies. Keeping GitHub as the evidence surface avoids shipping hundreds of non-runtime files while preserving one source tree and no generated package mirror.

## Consequences

- Release evidence and public docs remain available on GitHub.
- README links to excluded docs and reports use absolute GitHub URLs.
- npm package validation rejects `plugin-docs/`, `.skill-eval/`, and `.deprecated/` entries.
- Package and release checks keep `plugin.json`, `gemini-extension.json`, `.cursor-plugin/`, `com.github.copilot/`, and the host adapter paths versioned with the single package.
- Retired Output Router source and evaluation output are not package inputs.
