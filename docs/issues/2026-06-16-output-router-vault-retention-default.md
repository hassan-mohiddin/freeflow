# Output Router Vault Retention Default

> **Date:** 2026-06-16
> **Type:** Issue
> **Status:** Resolved
> **Source:** `docs/specs/freeflow-output-router-design.md`; `docs/plans/2026-06-16-freeflow-output-router-implementation-plan.md` Slice 1.

## Problem

The output router needs a default vault retention policy before Slice 2 implements session-linked vault storage.

The approved default vault root is:

```text
~/.cache/freeflow-router/vault/
```

The default TTL for normal outputs is 7 days.

## Why This Matters

Vault retention affects privacy, disk usage, recoverability, and session resume behavior. It should not be invented during storage implementation.

## Decision

Use TTL pruning metadata with a 7-day default for normal non-durable outputs.

The Slice 2 implementation records `retention: { strategy: "ttl", ttlDays: 7 }` and an `expiresAt` timestamp on vault records. Actual pruning remains conservative and is deferred until pruning behavior has dedicated tests.

Sensitive-output retention rules are separate and can be handled in the safety policy slice.
