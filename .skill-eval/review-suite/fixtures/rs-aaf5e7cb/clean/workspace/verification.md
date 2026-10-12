# Verification

Ran the provider-support tests from the pi-extension directory:

    node --test tests/provider-support/chatgpt-sign-in.test.js tests/provider-support/cache-keepalive.test.js

Result: 17 tests, 17 pass, 0 fail.

The Sign in with ChatGPT tests cover the qualified route with and without a base URL, an API key on the same route, a proxy base URL, a host without the registry check, and a registry check that throws. The keep-alive test covers the route that is never warmed.

Not run: the full pi-extension suite and the live provider checks.
