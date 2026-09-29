import { stagedFor } from "../../dist/host/staging.js";
import { reduce, replay } from "../../dist/cognitive-routing/state.js";

/** Routing's effective state: the session's recorded events plus control changes staged for the next prompt. */
export const routingState = (sessionManager) =>
  (stagedFor(sessionManager)?.events ?? []).reduce(
    (state, event) => reduce(state, event),
    replay(sessionManager.getBranch()),
  );
