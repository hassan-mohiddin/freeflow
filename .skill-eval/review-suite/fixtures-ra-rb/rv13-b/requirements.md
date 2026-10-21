# Requirements

The change keeps each routing profile's warmed request separate, including when a worker runs on the Coordinator's own model.

1. The keep-alive remembers the latest request for each session, provider, model and requester. The requester is the routing profile that sent the request, taken from the routing observation scope.
2. A request sent by a worker on the Coordinator's model does not replace the Coordinator's remembered request.
3. While a worker holds an assignment, the suspended Coordinator's hold names the Coordinator as its requester and keeps warm the Coordinator's own remembered request.
4. A refresh sends the remembered request of the lane it belongs to, with its messages and tools unchanged; the replay protocol caps only the output (max_tokens 1 for anthropic-messages, max_output_tokens 16 for OpenAI Responses). In the situation in requirement 2, the refresh sends the Coordinator's request, not the worker's.
5. Usage passed to `observe()` updates the prompt size of the lane keyed by the current requester (and the producing hold, when one is given), and of no other lane. Refresh usage is reported through `onRefresh` and does not change prompt size.
6. The refresh timing (the 90% point of the cache lifetime) and the rules for which requests are replayed are unchanged.
