export function createTextProofExtension(host) {
  const counters = {
    producerCalls: 0,
    callbackCalls: 0,
    storeWrites: 0,
    hostDispatches: 0,
  };

  function observedToolResultHandler(event) {
    counters.callbackCalls += 1;
    if (event.toolName === "fetch" && typeof event.text === "string") counters.storeWrites += 1;
  }

  host.on("tool_result", observedToolResultHandler);

  function deterministicFetchProducer() {
    counters.producerCalls += 1;
    return { toolName: "fetch", text: "fixture text" };
  }

  return {
    runProof() {
      const event = deterministicFetchProducer();
      observedToolResultHandler(event);
      return {
        ...counters,
        claimedIntegrated: counters.producerCalls === 1 && counters.callbackCalls === 1 && counters.storeWrites === 1,
      };
    },
  };
}
