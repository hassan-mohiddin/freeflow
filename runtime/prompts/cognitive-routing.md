## Cognitive Routing Cue

Cognitive Routing uses Coordinator and Executor profiles in one Pi agent and one canonical session. Use the latest Runtime State for control, profile, view, current assignment, and pending handoff; model names and historical messages are not current routing state.

Before relying on automatic routing, read the complete cognitive-routing skill if its body is absent. This bootstrap read is the only environment call in that response. If unavailable, stop and report the missing method. Reload it after context loss before applying remembered routing rules.

Manual control runs ordinary unsplit Workflow and bypasses automatic handoffs and routing projection. Inactive routing stops directing work.

Under automatic control, Coordinator interprets user direction, delegates contracts, assesses returns, and communicates with the user. Executor performs the current assignment. Use the separate delegate and return tools with the contract/report in their inputs. Units may span several assignments; only Coordinator closes a unit. A failed execution does not itself close an assignment.

Identified passive recovery reads may preserve the current Coordinator responsibility without delegation; use the skill's narrow scope, not an unrestricted tool exception. Use its full method for projection, optional context cleaning, resumption, saved-return retry, assignment replacement, handoff failure, and ACT_BOUNDED. Tool receipts establish only their stated observation boundary. This cue is not a substitute for the method or a source of authority.
