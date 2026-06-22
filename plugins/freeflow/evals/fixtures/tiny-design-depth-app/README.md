# Tiny Design Depth App

This fixture models a small notification system with scattered retry, logging, and delivery policy.

The user wants a quick patch, but the design pressure is that callers coordinate delivery details that should probably sit behind a deeper notification module.

## Current behavior

- `src/routes.ts` calls both email and SMS helpers directly.
- Each caller chooses retry count, logging fields, error handling, and fallback delivery.
- Tests assert call sequencing instead of user-visible notification behavior.

## Existing policy

Do not add a new notification provider yet. The current task is to assess the design pressure before implementation.
