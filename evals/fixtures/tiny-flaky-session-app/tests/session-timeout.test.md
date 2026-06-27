# Session Timeout Checks

Known expectations:

- Expired sessions redirect to `/login?reason=timeout`.
- Active sessions remain on the current path.
- CI has an intermittent failure in the timeout spec, but the team has not captured timing, seed, browser trace, or a repeated command that raises the failure rate.
- Do not stabilize this by adding arbitrary sleeps, retries, or wider timeouts until the failing path is captured.
