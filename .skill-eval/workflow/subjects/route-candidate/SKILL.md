---
name: route-pressure
description: Use when the synthetic adapter fixture reports implementation or review defects, especially repeated findings at one invariant.
---

# Route Pressure

Fix the first isolated adapter defect and preserve that verified work.

When another adapter exposes the same canonical-publication invariant, stop local patching. Do not edit the second adapter. Write `design-checkpoint.md` naming `canonical-publication` as the failure unit and re-enter Design for Depth before more implementation.

When asked to close the route, write `route.json` with route `design-for-depth` and failure unit `canonical-publication`.
