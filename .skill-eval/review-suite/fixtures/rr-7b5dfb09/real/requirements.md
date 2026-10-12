# Requirements: profile switch tool requests and rendering

The change lets the model request one bounded Cognitive Routing profile switch through the `freeflow_switch_profile` tool, validates the request before any controller call, and renders a switch's call and result in the transcript.

1. The tool is named `freeflow_switch_profile`. Its parameters are exactly `target`, which is `standard` or `reasoning`, and `reason`, a string of at most 160 characters. Both are required, and no other parameter is accepted.
2. A request is validated before any controller call. An unknown target is blocked with `target_must_be_standard_or_reasoning`. A missing or blank reason is blocked with `reason_required`. A reason with a line break is blocked with `reason_must_be_single_line`, and a reason longer than 160 characters with `reason_too_long`. A blocked request returns `status: "blocked"` with that reason, and the controller is not called.
3. A valid request reaches the controller only when a controller exists, its state is effective, and its control mode is `automatic`. With no controller the result is blocked with `not_available`. With an ineffective runtime it is blocked with `not_active`. With manual control it is blocked with `manual_hold`, and the controller's switch method is not called.
4. For a valid request under automatic control, the controller receives the target and the reason with surrounding whitespace removed. The tool returns the controller's result unchanged in `details.result`.
5. The tool's text result carries the same outcome in model-visible form: a first line naming the tool and status, then `profile`, and `changed`, `from` and `to` when the controller supplied them. The renderer can recover the same outcome from that text.
6. A rendered result states the outcome. A switch that changed the profile reads `Cognitive Routing: <from> → <to>`. A switch that changed nothing reads `Cognitive Routing: <to> (already active)`. An active result without transition details reads `Cognitive Routing: active · <profile>`. Blocked and inactive results read `Cognitive Routing: <status> · <reason>`.
7. Rendering a call does not read live controller state. It uses only the arguments of the call.
8. A profile switch appears in the transcript as one Cognitive Routing line that reports its outcome.
