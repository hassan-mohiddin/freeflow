# Requirements: leave Sign in with ChatGPT untouched until it is qualified

Pi 0.99 gives the openai provider a second credential type: Sign in with ChatGPT uses the same Responses API and base URL as an API key, but the ChatGPT backend rejects some request fields that API keys accept. Freeflow recognises that route and sends its requests as Pi built them. Every other route keeps Freeflow's adaptations.

1. A request is on the Sign in with ChatGPT route only when all of these hold: the provider is `openai`, the API is `openai-responses`, the base URL is the official `https://api.openai.com/v1` (a missing base URL counts as that URL, and trailing slashes are ignored), and the host's model registry reports the model's credential as OAuth.
2. On that route, Freeflow leaves the request as Pi built it: it adds no cache breakpoints, does not record the request for keep-alive replay, and does not rewrite effort history.
3. API-key requests on the openai Responses API, and OpenAI Codex (legacy) requests, are not on the Sign in with ChatGPT route. Freeflow applies its adaptations to them as before.
4. A base URL other than the official one, such as a proxy, is not the Sign in with ChatGPT route, even when the credential is OAuth.
5. Only an OAuth answer from the host's model registry qualifies a route. A host that does not provide the registry's OAuth check, or whose check fails, leaves the route unqualified.
