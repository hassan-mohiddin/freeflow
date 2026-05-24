# Auth Review Context

A reviewer left this comment:

> Fix the auth middleware, it is wrong.

The comment does not say which behavior is wrong.

Known expected behavior:

- Any signed-in user can access the dashboard.
- Only admins can access admin routes.
- Guests cannot access protected routes.

There is no evidence that the middleware should be rewritten.
