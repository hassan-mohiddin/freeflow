# Tool Policy

Tools are capabilities. Skills are guidance.

Do not hard-gate Freeflow skills by role. Enforce role boundaries through active tools, task policy, and parent oversight.

## Layers

```text
active tool allowlist
+ tool-call policy guard
+ parent/orchestrator oversight
```

Give each role enough tools to do its job. Block capabilities that violate role boundaries or create high-risk side effects.

## No Dynamic Grants

A running child pane cannot receive new tools.

If a child needs a blocked capability, it returns a capability gap. The parent chooses one route:

- handle it directly;
- spawn a pane with the right profile/tools;
- ask the user;
- deny or defer.

Do not mutate the child’s tool set mid-run.

## Typical Policy

- Researcher/reviewer: read and routed evidence tools; no edit/write.
- Worker: read/edit/write/bash/routed tools inside assigned checkout/worktree.
- Verifier: read/bash/routed run for allowed commands; no edit/write.
- Integrator: write in integration checkout; merge/apply only assigned packages; no push.
- Parents: broad tools because they coordinate and may talk with the user.

## Guard Examples

Block:

- secret paths and credentials;
- writes outside assigned scope;
- `git push` except final orchestrator/user-approved closeout;
- unplanned commits;
- destructive shell;
- commands not listed for verifier/reviewer/researcher;
- product-code writes from planning-parent unless explicitly scoped.

## Capability Gap Example

```text
FFRESULT
STATUS|blocked
BLOCKER|capability_gap|Need targeted test command run.|suggested_route=verifier
REQUEST|run_check|npm test auth
RECOMMENDATION|Launch verifier with allowed command.
END_FFRESULT
```

Parent routes the request. It does not grant the reviewer bash.
