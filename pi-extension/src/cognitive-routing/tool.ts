import type { CognitiveRoutingController, CognitiveRoutingSwitchResult } from "./controller.js";
import type { CognitiveRoutingProfileName } from "./types.js";

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

type SwitchToolParams = {
  target?: unknown;
  reason?: unknown;
};

function resultText(result: CognitiveRoutingSwitchResult): string {
  if (result.status === "active") return `${COGNITIVE_ROUTING_SWITCH_TOOL_NAME}|active\nprofile|${result.profile}`;
  return `${COGNITIVE_ROUTING_SWITCH_TOOL_NAME}|${result.status}\nreason|${result.reason}`;
}

function blocked(reason: string): CognitiveRoutingSwitchResult {
  return { status: "blocked", reason };
}

function validateParams(
  params: SwitchToolParams,
): { status: "valid"; target: CognitiveRoutingProfileName; reason: string } | { status: "invalid"; reason: string } {
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

export function registerCognitiveRoutingTool(
  pi: {
    registerTool(tool: Record<string, unknown>): void;
  },
  getController: () => CognitiveRoutingController | undefined,
) {
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
    async execute(_toolCallId: string, params: SwitchToolParams, _signal: unknown, _onUpdate: unknown, _ctx: unknown) {
      const controller = getController();
      const input = validateParams(params ?? {});
      const result =
        input.status === "invalid"
          ? blocked(input.reason)
          : !controller
            ? blocked("not_available")
            : !controller.state().effective
              ? blocked("not_active")
              : controller.state().controlMode !== "automatic"
                ? blocked("manual_hold")
                : await controller.switchAutomaticProfile(input.target, input.reason);
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: { result },
      };
    },
  });
}
