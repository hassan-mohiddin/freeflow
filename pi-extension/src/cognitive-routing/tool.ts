import type { CognitiveRoutingController, CognitiveRoutingSwitchResult } from "./controller.js";
import { textComponent } from "../ui/text-component.js";
import type { CognitiveRoutingHistoryOptions, CognitiveRoutingHistoryResult } from "./history.js";
import type { CognitiveRoutingProfileName } from "./types.js";

export const COGNITIVE_ROUTING_SWITCH_TOOL_NAME = "freeflow_switch_profile";
export const COGNITIVE_ROUTING_HISTORY_TOOL_NAME = "freeflow_cognitive_routing_history";

export const COGNITIVE_ROUTING_HISTORY_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    scope: {
      type: "string",
      enum: ["session", "active-branch"],
      description: "History scope to read.",
    },
    anomaliesOnly: {
      type: "boolean",
      description: "Return only events whose integrity is anomaly.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      description: "Maximum number of newest events to return.",
    },
  },
  required: [],
};

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

type HistoryToolParams = {
  scope?: unknown;
  anomaliesOnly?: unknown;
  limit?: unknown;
};

type HistoryReader = (
  options: CognitiveRoutingHistoryOptions,
  context?: unknown,
) => CognitiveRoutingHistoryResult | Promise<CognitiveRoutingHistoryResult>;

type SwitchToolParams = {
  target?: unknown;
  reason?: unknown;
};

type RenderedSwitchResult =
  | {
      status: "active";
      profile: CognitiveRoutingProfileName;
      changed?: boolean;
      from?: CognitiveRoutingProfileName;
      to?: CognitiveRoutingProfileName;
    }
  | { status: "blocked" | "inactive"; reason: string };

function resultText(result: CognitiveRoutingSwitchResult): string {
  if (result.status === "active") {
    const fields = [COGNITIVE_ROUTING_SWITCH_TOOL_NAME + "|active", `profile|${result.profile}`];
    if (result.changed !== undefined) fields.push(`changed|${result.changed}`);
    if (result.from) fields.push(`from|${result.from}`);
    if (result.to) fields.push(`to|${result.to}`);
    return fields.join("\n");
  }
  return `${COGNITIVE_ROUTING_SWITCH_TOOL_NAME}|${result.status}\nreason|${result.reason}`;
}

function blocked(reason: string): CognitiveRoutingSwitchResult {
  return { status: "blocked", reason };
}

function renderNothing() {
  return {
    render() {
      return [];
    },
    invalidate() {},
  };
}

function renderTransition(text: string, theme: any) {
  return textComponent(theme?.fg ? theme.fg("accent", text) : text);
}

function isProfileName(value: unknown): value is CognitiveRoutingProfileName {
  return value === "standard" || value === "reasoning";
}

function resultFromPayload(payload: any): RenderedSwitchResult | undefined {
  const details = payload?.details?.result ?? payload?.result ?? payload?.details;
  if (details && (details.status === "active" || details.status === "blocked" || details.status === "inactive")) {
    if (details.status !== "active") return details as CognitiveRoutingSwitchResult;
    if (!isProfileName(details.profile)) return undefined;
    return {
      status: "active",
      profile: details.profile,
      ...(typeof details.changed === "boolean" ? { changed: details.changed } : {}),
      ...(isProfileName(details.from) ? { from: details.from } : {}),
      ...(isProfileName(details.to) ? { to: details.to } : {}),
    };
  }

  const text = Array.isArray(payload?.content)
    ? payload.content.find((part: any) => part?.type === "text")?.text
    : undefined;
  if (typeof text !== "string") return undefined;
  const fields = new Map<string, string>();
  for (const line of text.split("\\n")) {
    const separator = line.indexOf("|");
    if (separator <= 0) continue;
    fields.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const status = fields.get(COGNITIVE_ROUTING_SWITCH_TOOL_NAME);
  if (status === "active") {
    const profile = fields.get("profile");
    if (!isProfileName(profile)) return undefined;
    const changed = fields.get("changed");
    const from = fields.get("from");
    const to = fields.get("to");
    return {
      status,
      profile,
      ...(changed === "true" || changed === "false" ? { changed: changed === "true" } : {}),
      ...(isProfileName(from) ? { from } : {}),
      ...(isProfileName(to) ? { to } : {}),
    };
  }
  if (status === "blocked" || status === "inactive") {
    const reason = fields.get("reason");
    return reason ? { status, reason } : undefined;
  }
  return undefined;
}

function historyOptions(params: HistoryToolParams): CognitiveRoutingHistoryOptions {
  return {
    ...(params.scope === "active-branch" ? { scope: "active-branch" as const } : {}),
    ...(params.anomaliesOnly === true ? { anomaliesOnly: true } : {}),
    ...(Number.isInteger(params.limit) ? { limit: Math.max(1, Math.min(100, params.limit as number)) } : {}),
  };
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
      let result: CognitiveRoutingSwitchResult;
      if (input.status === "invalid") {
        result = blocked(input.reason);
      } else if (!controller) {
        result = blocked("not_available");
      } else if (!controller.state().effective) {
        result = blocked("not_active");
      } else if (controller.state().controlMode === "automatic") {
        result = await controller.switchAutomaticProfile(input.target, input.reason);
      } else {
        result = blocked("manual_hold");
      }
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: { result },
      };
    },
    renderCall(_args: SwitchToolParams, _theme: any) {
      return renderNothing();
    },
    renderResult(result: any, _options: any, theme: any) {
      const outcome = resultFromPayload(result);
      if (outcome?.status === "active") {
        if (outcome.changed === true && outcome.from && outcome.to) {
          return renderTransition(`Cognitive Routing: ${outcome.from} → ${outcome.to}`, theme);
        }
        if (outcome.changed === false && outcome.to) {
          return renderTransition(`Cognitive Routing: ${outcome.to} (already active)`, theme);
        }
        return renderTransition(`Cognitive Routing: active · ${outcome.profile}`, theme);
      }
      if (outcome) {
        return renderTransition(`Cognitive Routing: ${outcome.status} · ${outcome.reason}`, theme);
      }
      return renderTransition(`Cognitive Routing: ${result?.isError ? "error" : "result unavailable"}`, theme);
    },
  });
}

export function registerCognitiveRoutingHistoryTool(
  pi: {
    registerTool(tool: Record<string, unknown>): void;
  },
  readHistory: HistoryReader,
) {
  pi.registerTool({
    name: COGNITIVE_ROUTING_HISTORY_TOOL_NAME,
    label: "Read Cognitive Routing History",
    description:
      "Read the deterministic Cognitive Routing transition history without changing routing or session state.",
    promptSnippet: "Inspect Cognitive Routing transition history when debugging or monitoring profile behavior.",
    promptGuidelines: [
      "Use only when debugging or monitoring Cognitive Routing is requested.",
      "This tool is read-only and does not change profile, control, branch, or session state.",
      "Use scope=active-branch to inspect only the current branch ancestry.",
      "Use anomaliesOnly=true to inspect only integrity anomalies.",
    ],
    parameters: COGNITIVE_ROUTING_HISTORY_PARAMETERS,
    async execute(
      _toolCallId: string,
      params: HistoryToolParams,
      _signal: unknown,
      _onUpdate: unknown,
      context: unknown,
    ) {
      const result = await readHistory(historyOptions(params ?? {}), context);
      return {
        content: [{ type: "text", text: `Cognitive Routing history\n${JSON.stringify(result)}` }],
        details: { result },
      };
    },
  });
}
