import { textComponent } from "../ui/text-component.js";
export const COGNITIVE_ROUTING_SWITCH_TOOL_NAME = "freeflow_switch_profile";
export const COGNITIVE_ROUTING_SWITCH_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    target: {
      type: "string",
      enum: ["standard", "reasoning"],
      description: "The configured Cognitive Routing profile to activate.",
    },
    reason: {
      type: "string",
      minLength: 1,
      maxLength: 160,
      description: "A concise one-line reason for the profile transition.",
    },
  },
  required: ["target", "reason"],
};
function resultText(result) {
  if (result.status === "active") return `${COGNITIVE_ROUTING_SWITCH_TOOL_NAME}|active\nprofile|${result.profile}`;
  return `${COGNITIVE_ROUTING_SWITCH_TOOL_NAME}|${result.status}\nreason|${result.reason}`;
}
function blocked(reason) {
  return { status: "blocked", reason };
}
function transitionLabel(from, to) {
  if (from && to && from === to) return `Cognitive Routing: ${to} (already active)`;
  return `Cognitive Routing: ${from ?? "current"} -> ${to ?? "unknown"}`;
}
function renderTransition(text, theme) {
  return textComponent(theme?.fg ? theme.fg("accent", text) : text);
}
function transitionOrigin(getController, target, context) {
  const liveProfile = getController()?.state().activeProfile;
  if (!context?.state || !target || context.argsComplete === false) return liveProfile;
  if (!context.state.transitionOriginCaptured) {
    context.state.transitionOriginCaptured = true;
    context.state.transitionOrigin = liveProfile;
  }
  return context.state.transitionOrigin;
}
function resultFromPayload(payload) {
  const details = payload?.details?.result ?? payload?.result ?? payload?.details;
  if (details && (details.status === "active" || details.status === "blocked" || details.status === "inactive")) {
    return details;
  }
  const text = Array.isArray(payload?.content)
    ? payload.content.find((part) => part?.type === "text")?.text
    : undefined;
  if (typeof text !== "string") return undefined;
  const fields = new Map();
  for (const line of text.split("\\n")) {
    const separator = line.indexOf("|");
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const status = fields.get(COGNITIVE_ROUTING_SWITCH_TOOL_NAME);
  if (status === "active") {
    const profile = fields.get("profile");
    return profile === "standard" || profile === "reasoning" ? { status, profile } : undefined;
  }
  if (status === "blocked" || status === "inactive") {
    const reason = fields.get("reason");
    return reason ? { status, reason } : undefined;
  }
  return undefined;
}
function validateParams(params) {
  if (params.target !== "standard" && params.target !== "reasoning") {
    return { status: "invalid", reason: "target_must_be_standard_or_reasoning" };
  }
  if (typeof params.reason !== "string") {
    return { status: "invalid", reason: "reason_required" };
  }
  const reason = params.reason.trim();
  if (!reason) return { status: "invalid", reason: "reason_required" };
  if (reason.includes("\n") || reason.includes("\r"))
    return { status: "invalid", reason: "reason_must_be_single_line" };
  if (reason.length > 160) return { status: "invalid", reason: "reason_too_long" };
  return { status: "valid", target: params.target, reason };
}
export function registerCognitiveRoutingTool(pi, getController) {
  pi.registerTool({
    name: COGNITIVE_ROUTING_SWITCH_TOOL_NAME,
    label: "Switch Cognitive Profile",
    description: "Request one bounded Cognitive Routing profile transition while automatic control is active.",
    promptSnippet: "Switch between the configured standard and reasoning profiles when the current task needs it.",
    promptGuidelines: [
      "Use only when the current task needs a different reasoning profile.",
      "Give one concise sentence as the reason and make this the only tool call in the response.",
      "Do not call this tool while a deterministic manual profile hold is active.",
    ],
    parameters: COGNITIVE_ROUTING_SWITCH_PARAMETERS,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const controller = getController();
      const input = validateParams(params ?? {});
      let result;
      if (input.status === "invalid") {
        result = blocked(input.reason);
      } else if (!controller) {
        result = blocked("not_available");
      } else if (!controller.state().effective) {
        result = blocked("not_active");
      } else if (controller.state().controlMode !== "automatic") {
        result = blocked("manual_hold");
      } else {
        result = await controller.switchAutomaticProfile(input.target, input.reason);
      }
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: { result },
      };
    },
    renderCall(args, theme, context) {
      const target = args?.target === "standard" || args?.target === "reasoning" ? args.target : undefined;
      return renderTransition(transitionLabel(transitionOrigin(getController, target, context), target), theme);
    },
    renderResult(result, _options, theme) {
      const outcome = resultFromPayload(result);
      if (outcome?.status === "active") {
        return renderTransition(`Cognitive Routing: active · ${outcome.profile}`, theme);
      }
      if (outcome) {
        return renderTransition(`Cognitive Routing: ${outcome.status} · ${outcome.reason}`, theme);
      }
      return renderTransition(`Cognitive Routing: ${result?.isError ? "error" : "result unavailable"}`, theme);
    },
  });
}
