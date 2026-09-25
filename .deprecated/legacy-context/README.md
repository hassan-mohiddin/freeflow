# Retired Context Capabilities (Historical Archive)

This archive preserves the legacy Freeflow Context tool, Context Virtualization, and Conversation History source and guidance removed from the active runtime.

The source files, runtime prompts, capability skills, feature-specific tests, and former public capability pages were restored byte-for-byte from repository commit `09216f185056ee62eea92a495c4df76fa328acc3`. The `.skill-eval/context-virtualization/` suite was archived from the unchanged working tree at the same revision; it contains case definitions, fixtures, and probe extensions. No context-specific accepted run report or coverage-matrix entry was found, so this archive is not evidence that the suite passed or that the former features are behaviorally qualified.

The directory layout mirrors the original repository paths. The former standalone public capability pages are preserved byte-for-byte in `plugin-docs/capabilities/`. These files are historical only: they are not supported runtime code, current contracts, or npm package contents. Do not import or execute them as the current implementation. Generated `pi-extension/dist` output is intentionally not archived; it is derived from active source. Context Control remains a separate planned feature and is not implemented by this archive.
