/**
 * Observe the payload only after provider adapters registered earlier have had
 * their chance to transform it. Observation is fail-open and never replaces the
 * provider payload or response.
 */
export function registerProviderObservation(pi, sink) {
  pi.on("before_provider_request", (event, ctx) => {
    try {
      sink.observePrepared(event.payload, ctx);
    } catch {
      // Accounting is diagnostic. It cannot make an otherwise valid request fail.
    }
  });
  pi.on("after_provider_response", (event, ctx) => {
    try {
      sink.observeResponse(event.status, event.headers, ctx);
    } catch {
      // Header observation is not provider control or usage attribution.
    }
  });
}
