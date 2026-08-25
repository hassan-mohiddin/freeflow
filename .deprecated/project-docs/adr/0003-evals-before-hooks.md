# Evals Before Enforcement Hooks

Freeflow should prove behavior with baseline-versus-with-skill evals before adding enforcement hooks.

Context-loading runtime may deliver static prompt fragments, current Runtime State, and discoverable guidance from one effective-state snapshot. Those adapters load context only. Hooks that block tools or enforce workflow policy remain deferred until measured repeated failures justify them. Public plugin delivery details are defined by [ADR 0006: Prompt Fragments And Discoverable Skills](../../../plugin-docs/adr/0006-prompt-fragments-and-discoverable-skills.md).
