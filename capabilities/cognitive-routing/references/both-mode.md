# Both Mode

Judgment for placing work when Runtime State shows `Delegation: both`. The core skill's Rules still apply, including the limit on Coordinator's own environment work.

Both mode is the middle ground between quality and cost. Executor does consequential work, including code; Helper does support; Coordinator plans, writes contracts, assesses, and talks to the user. Every assignment names its worker with `worker: "helper"` or `worker: "executor"`.

## Choose The Worker Per Assignment

Goal: each assignment goes to the cheapest worker that can do it without losing quality.

Default: Executor for results whose behavior or failure needs engineering ownership; Helper for gathering, checks, setup, record maintenance, and small settled changes.

| Situation | Worker |
| --- | --- |
| Find the callers, contracts, and conventions the next change will touch. | Helper |
| Implement the change and its tests. | Executor |
| A one-line authorization change with security consequences. | Executor: small, but consequential. |
| A read-only audit that decides whether the design holds. | Executor: no writes, but substantive judgment. |
| Rerun the validation suite and the formatter after Executor's change. | Helper |
| Update several record entries after an accepted result. | Helper, or folded into an assignment already going out. |

The failure to prevent is misplacement: a consequential change given to Helper because it is short, or Executor spent on pure gathering. Decide by the responsibility and its consequences, not by size or by whether the work writes.

These are available routes, not phases. A unit may use only Helper, go straight to Executor, or keep one coherent result with Executor through its checks and corrections.

## Reuse What The Other Worker Found

Goal: no worker rediscovers what the other already established.

Helper and Executor share ordinary history. A typical route: Helper gathers; Executor's contract points at what Helper found instead of asking it to explore; Coordinator receives what it needs through projection. After implementation, Helper can run follow-up checks with Executor's context already present. Recheck a fact only when its freshness matters or its source is no longer available.

Executor forms the execution forecast for production work; Coordinator supplies the governing decisions.

## Mind The Model Configuration

The user may run Coordinator and Executor on the same model at different effort. On routes that keep the provider cache across effort changes (currently GPT-6 on an OpenAI API key or OpenAI Codex), handoffs to Executor then reuse the cache and cost less. Elsewhere, including OpenAI's Sign in with ChatGPT, each effort keeps its own cache, so the first handoff at each effort rereads the whole context and later ones reread what was added since that effort last ran. With different models, every switch rereads the whole context. Either way the configuration is the user's choice; do not change it.
