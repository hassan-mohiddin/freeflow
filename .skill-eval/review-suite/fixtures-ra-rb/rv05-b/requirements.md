# Requirements: Cognitive Routing at startup in an empty session

The change keeps a new session with no history free of Cognitive Routing state until its first prompt, and it makes the status line and the prompt describe the routing state that is in effect at startup.

1. A new session with no conversation and no Cognitive Routing entries starts no routing runtime at `session_start`: the session performs no routing operations and persists no routing entries. The first prompt starts the runtime, records its intent entry, and adds the Automatic Routing Kernel to that turn's system prompt.
2. While Cognitive Routing is configured, enabled and effective, no host-selected model or thinking level suppresses it, and the session has no runtime yet, the status line does not report Cognitive Routing as blocked or inactive. A runtime that exists but is ineffective, or is blocked by configuration, is still reported as blocked with its reason.
3. A host-selected model or thinking level at startup (`modelStateProvenance.explicitModel` or `explicitThinking`) suppresses Cognitive Routing. For such a session, the capability state passed to the prompt reports Cognitive Routing as `effective: false`, even when a routing runtime is effective. For a session without such a selection, an effective routing runtime leaves Cognitive Routing effective in that capability state.
