# Design Pressure Signals

Use this reference when reviewing code, artifacts, or work for shallow modules and complexity spread.

The goal is not to find every smell. The goal is to notice pressure that changes the next route.

## Quick Classifier

Ask:

1. What is the module?
2. What is the interface?
3. What details are callers forced to know?
4. What decision is likely to change?
5. Where would that decision be localized?
6. Would solving this now fit the approved scope?

Then classify:

- **Continue:** no design pressure that changes the next action.
- **Local fix:** improve within current module/interface.
- **Plan revision:** slice boundary or verification path is wrong.
- **Spec/discovery:** behavior, scope, or acceptance is unclear.
- **Owner decision:** public API, compatibility, security, privacy, billing, data loss, permissions, migration, or hard-to-reverse architecture.
- **Deferred deepening:** real design pressure, but not worth solving in this scope.

## Signals And What They Usually Mean

### Shotgun Surgery

Signal: one concept requires many unrelated edits.

Examples:

- retry policy added to every route;
- permission check copied into API, UI, and job worker;
- billing grace-period logic repeated in webhook, email, and dashboard;
- cache freshness flags threaded through callers.

Likely issue: a likely-changing decision is not hidden behind a module.

Route:

- If behavior/scope is unsettled: discovery or spec.
- If behavior is settled but slice spreads edits: plan revision or refactor candidate.

### Caller Choreography

Signal: callers must perform steps in the right order.

Examples:

```text
open connection -> set retry -> register cleanup -> call provider -> translate error -> log metric
```

Likely issue: interface exposes implementation sequence.

Better interface asks for outcome:

```text
deliverNotification(invitation)
```

while the module owns retry, fallback, logging, cleanup, and provider errors.

### Scattered Policy

Signal: product or operational rules appear in many places.

Examples:

- billing downgrade timing in UI, webhook, worker, and tests;
- notification fallback rules in every route;
- authorization rules in frontend and backend separately;
- migration compatibility gates inside individual callers.

Likely issue: policy is not localized.

Stop if changing it would alter product, security, privacy, billing, permissions, public API, compatibility, or data-loss behavior.

### Test Knows Too Much

Signal: tests assert implementation sequencing instead of behavior.

Examples:

- tests assert `sendEmail` then `logFailure` then `sendSms` in every route;
- tests mock five helpers to verify one user-visible behavior;
- tests duplicate retry counts and provider error types;
- tests need private methods or internal state.

Likely issue: the production interface is not the right test seam.

Do not automatically add mocks. Ask whether the module interface should own the behavior.

### Edge-Case Patch Stream

Signal: each review pass finds another special case.

Examples:

- “also handle null phone”; then “also handle email bounce”; then “also handle duplicate invite”; then “also handle retry telemetry.”

Likely issue: review is exposing missing behavior ownership, not isolated bugs.

Route:

- classify findings;
- stop at review cap;
- diagnose whether discovery, spec, plan, source truth, module shape, or reviewer context is wrong.

### Pass-Through Wrapper

Signal: a module mostly renames another call.

Example:

```ts
function sendTeamInviteEmail(email, subject, options) {
  return sendEmail(email, subject, options);
}
```

Likely issue: shallow wrapper.

Options:

- delete it if it hides nothing;
- deepen it by moving real policy behind it;
- keep it only if it expresses a stable domain interface that will soon hide behavior.

### Leaky Interface

Signal: callers know provider/database/cache internals.

Examples:

- callers catch Stripe-specific errors;
- UI code knows database enum transitions;
- API callers pass cache invalidation flags;
- tests assert internal queue names.

Likely issue: implementation detail leaked through interface.

Route to design if leakage blocks safe change or verification.

### God Module

Signal: one file owns unrelated responsibilities.

Examples:

- route file validates input, applies policy, calls providers, logs metrics, and formats UI copy;
- workflow module owns routing, vaulting, parsing, rendering, and config mutation.

Likely issue: missing internal modules or seams.

Do not split by file type alone. Split around hidden decisions and interfaces.

### Speculative Seam

Signal: interface/adapters/factory exist for only imagined future variation.

Examples:

- `PaymentProviderAdapterFactoryRegistry` when only Stripe exists and no migration is planned;
- strategies for every small formatting function;
- generic repository around a single simple query.

Likely issue: indirection without leverage.

Use the variation test: one adapter is hypothetical; two adapters or known upcoming variation justify a seam better.

### Premature Artifact Detail

Signal: spec or plan chooses exact classes, factories, tables, or algorithms before evidence exists.

Likely issue: artifact is hiding uncertainty as implementation detail.

Better:

```text
Tentative: likely need a policy-owning module if retry/fallback rules spread.
Open: whether provider variation is real in this scope.
Stop: revisit plan if slice requires touching every caller.
```

## Before / After Examples

### Notification Retry

Bad direction:

```text
Add retryCount to each route that sends notifications.
```

Pressure:

- callers know retry policy;
- fallback and telemetry are duplicated;
- tests assert provider sequencing;
- adding another provider touches every caller.

Better direction:

```text
Introduce a notification delivery module whose interface accepts the notification intent and owns retry, fallback, provider errors, and telemetry.
```

Still ask owner decisions before changing user-visible delivery semantics.

### Billing Grace Period

Bad direction:

```text
Patch webhook to downgrade immediately, update email text, adjust dashboard copy.
```

Pressure:

- billing policy spread across systems;
- likely source-truth conflict with docs/tests;
- user-owned billing behavior.

Better direction:

```text
Stop at interview gate. Decide billing policy first. Then localize policy behind a billing-state transition module if implementation spreads.
```

### Cache Freshness

Bad direction:

```text
Thread forceRefresh through every caller.
```

Pressure:

- callers know cache invalidation policy;
- tests must set timing flags;
- source truth may allow caching.

Better direction:

```text
Discover expected freshness boundary. If source truth supports it, hide invalidation/freshness rules behind a cache-aware read interface.
```

## False Positives

Do not overreact when:

- a small repeated pattern is stable and local;
- a one-off script does not need long-term depth;
- a wrapper exists for public compatibility;
- broad edits are mechanical and source-backed;
- tests inspect internals only for an internal module whose interface is intentionally internal;
- deeper design would expand scope beyond the user's goal.

When in doubt, classify as deferred design pressure rather than silently refactoring.
