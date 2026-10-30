import { reviewStateLine, skillsStateLine } from "./config-validation.js";
import { hasUsableMandatoryPrompts } from "./prompts.js";

/**
 * The Freeflow Runtime State message: what is active this request, placed so unchanged state keeps its cached
 * position and changed state never rewrites earlier input. Also drops bootstrap messages that older Freeflow
 * versions saved in sessions.
 */
const FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE = "freeflow-runtime-state";

const COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE = "freeflow-cognitive-routing-runtime-state";

const WORKFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-workflow-bootstrap";

const COGNITIVE_ROUTING_BOOTSTRAP_MESSAGE_TYPE = "freeflow-cognitive-routing-bootstrap";

const FREEFLOW_BOOTSTRAP_MESSAGE_TYPE = "freeflow-bootstrap";

const BOOTSTRAP_COMPONENTS = Object.freeze({
  workflow: "workflow",
  cognitiveRouting: "cognitive-routing",
});

function bootstrapEntryComponents(entry: any) {
  const isCustomMessage = entry?.role === "custom" || entry?.type === "custom_message" || entry?.type === "custom";
  if (!isCustomMessage) return [];
  if (entry.customType === FREEFLOW_BOOTSTRAP_MESSAGE_TYPE) {
    if (Array.isArray(entry.details?.components)) return entry.details.components;
    return [
      ...(entry.content?.includes("<!-- freeflow-bootstrap:workflow -->") ? [BOOTSTRAP_COMPONENTS.workflow] : []),
      ...(entry.content?.includes("<!-- freeflow-bootstrap:cognitive-routing -->")
        ? [BOOTSTRAP_COMPONENTS.cognitiveRouting]
        : []),
    ];
  }
  if (entry.customType === WORKFLOW_BOOTSTRAP_MESSAGE_TYPE) {
    return [BOOTSTRAP_COMPONENTS.workflow];
  }
  if (entry.customType === COGNITIVE_ROUTING_BOOTSTRAP_MESSAGE_TYPE) {
    return [BOOTSTRAP_COMPONENTS.cognitiveRouting];
  }
  return [];
}

export function filterBootstrapMessage(message: any) {
  return bootstrapEntryComponents(message).length === 0 ? message : undefined;
}

type CognitiveRoutingRuntimeSnapshot = {
  effective?: boolean;
  runtimeStatus?: "active" | "inactive" | "blocked";
  runtimeReason?: unknown;
  activeProfile?: unknown;
  pendingPair?: unknown;
  delegation?: unknown;
  controlMode?: unknown;
};

type CognitiveRoutingProjectionMode = "disabled" | "enabled" | "manual-bypass" | "blocked" | "unavailable" | "pending";

type FreeflowContextMessage = {
  customType?: unknown;
  [key: string]: unknown;
};

function publicCognitiveRoutingControl(controlMode: unknown) {
  if (controlMode === "automatic") return "automatic";
  if (["manual-helper", "manual-executor", "manual-coordinator"].includes(String(controlMode))) return "manual";
  return "unavailable";
}

function publicCognitiveRoutingProfile(activeProfile: unknown, effective: unknown) {
  if (effective !== true) return "unavailable";
  return typeof activeProfile === "string" && ["helper", "executor", "coordinator"].includes(activeProfile)
    ? activeProfile
    : "unavailable";
}

function publicCapabilityStatus(capability: any) {
  if (capability?.effective === true) return "active";
  if (!capability) return "unavailable";
  const blockingCode = capability.blockingReason?.code;
  if (blockingCode && blockingCode !== "disabled") return "unavailable";
  return "inactive";
}

function publicCognitiveRoutingStatus(capability: any, runtime: CognitiveRoutingRuntimeSnapshot | undefined) {
  if (runtime?.runtimeStatus === "inactive") return "inactive";
  return publicCapabilityStatus(capability);
}

function publicCognitiveRoutingProjectionMode(
  capability: any,
  runtime: CognitiveRoutingRuntimeSnapshot | undefined,
  projectionFailure?: string,
): CognitiveRoutingProjectionMode {
  if (capability?.projection !== true) return "disabled";
  if (capability?.effective !== true) return "unavailable";
  if (String(runtime?.controlMode).startsWith("manual-")) return "manual-bypass";
  if (projectionFailure) return "blocked";
  if (runtime?.runtimeStatus === "inactive" || runtime?.runtimeStatus === "blocked") return "unavailable";
  if (runtime?.effective === true && runtime.controlMode === "automatic") return "enabled";
  return "pending";
}

export function freeflowRuntimeStateMessage(
  capabilityState: any,
  cognitiveRoutingRuntime: CognitiveRoutingRuntimeSnapshot | undefined = undefined,
  freeflowContext: any = undefined,
  options: {
    projectionFailure?: string;
    /** Freeflow skills already read in this context, by name. */
    skills?: readonly string[];
  } = {},
) {
  const cognitiveRoutingEffective = capabilityState?.cognitiveRouting?.effective === true;
  const profile = publicCognitiveRoutingProfile(
    cognitiveRoutingRuntime?.activeProfile,
    cognitiveRoutingEffective && cognitiveRoutingRuntime?.effective === true,
  );
  const control =
    profile === "unavailable" ? "unavailable" : publicCognitiveRoutingControl(cognitiveRoutingRuntime?.controlMode);
  const projectionMode = publicCognitiveRoutingProjectionMode(
    capabilityState?.cognitiveRouting,
    cognitiveRoutingRuntime,
    options.projectionFailure,
  );
  const mandatoryPromptAvailable = capabilityState?.enabled !== true || hasUsableMandatoryPrompts(freeflowContext);
  const freeflowStatus = capabilityState?.configured
    ? capabilityState.enabled
      ? mandatoryPromptAvailable
        ? "active"
        : "unavailable"
      : "inactive"
    : capabilityState?.configExists
      ? "config error"
      : "setup needed";
  // Only a choice the user made: the default adds nothing, so most users' state stays as it was.
  const review = freeflowStatus === "active" ? reviewStateLine(capabilityState?.review) : null;
  const skillsOff = freeflowStatus === "active" ? skillsStateLine(capabilityState?.skills?.off) : null;

  return {
    role: "custom",
    customType: FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE,
    content: [
      "# Freeflow Runtime State",
      "",
      "This is extension-generated runtime state. Use it to interpret the stable Freeflow guidance.",
      "",
      `Freeflow: ${freeflowStatus}`,
      ...(review ? [review] : []),
      ...(skillsOff ? [skillsOff] : []),
      "",
      "Capabilities:",
      `- Cognitive Routing: ${publicCognitiveRoutingStatus(capabilityState?.cognitiveRouting, cognitiveRoutingRuntime)}`,
      `- Tool Execution: ${publicCapabilityStatus(capabilityState?.toolExecution)}`,
      ...(capabilityState?.messaging?.enabled
        ? [`- Messaging: ${publicCapabilityStatus(capabilityState.messaging)}`]
        : []),
      "",
      "Cognitive Routing:",
      `- Control: \`${control}\``,
      // Under Automatic control the routing Runtime State owns the active profile, so switches do not churn this state.
      ...(control === "automatic" ? [] : [`- Profile: \`${profile}\``]),
      `- Delegation: \`${cognitiveRoutingRuntime?.delegation ?? capabilityState?.cognitiveRouting?.delegation ?? "executor"}\``,
      `- Projection: \`${projectionMode}\``,
      ...(options.skills?.length ? ["", `Freeflow skills read in this context: ${options.skills.join(", ")}`] : []),
    ].join("\n"),
    display: false,
    details: { source: "provider-request-runtime-state" },
  };
}

function withoutFreeflowRuntimeState(messages: readonly FreeflowContextMessage[] | undefined) {
  return (Array.isArray(messages) ? messages : []).filter(
    (message) =>
      message?.customType !== FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE &&
      message?.customType !== COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE,
  );
}

function firstUserMessageIndex(messages: readonly FreeflowContextMessage[]): number {
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function insertRuntimeStateBeforeFirstUser(
  messages: readonly FreeflowContextMessage[],
  runtimeState: FreeflowContextMessage,
): FreeflowContextMessage[] {
  const firstUserIndex = firstUserMessageIndex(messages);
  if (firstUserIndex < 0) return [...messages, runtimeState];
  return [...messages.slice(0, firstUserIndex), runtimeState, ...messages.slice(firstUserIndex)];
}

export function withFreeflowRuntimeState(
  messages: readonly FreeflowContextMessage[] | undefined,
  capabilityState: any,
  cognitiveRoutingRuntime: CognitiveRoutingRuntimeSnapshot | undefined = undefined,
  freeflowContext: any = undefined,
  options: {
    force?: boolean;
    projectionFailure?: string;
    anchor?: RuntimeStateAnchor;
    skills?: readonly string[];
  } = {},
) {
  const source = Array.isArray(messages) ? messages : [];
  const runtimeState = freeflowRuntimeStateMessage(capabilityState, cognitiveRoutingRuntime, freeflowContext, {
    projectionFailure: options.projectionFailure,
    skills: options.skills,
  });
  const runtimeStateMessages = source.filter(
    (message) =>
      message?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE ||
      message?.customType === COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE,
  );
  const withoutRuntimeState = withoutFreeflowRuntimeState(source);
  const expectedRuntimeStateIndex = firstUserMessageIndex(withoutRuntimeState);
  const runtimeStateIndex = source.findIndex((message) => message?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE);
  const unchanged =
    options.force !== true &&
    runtimeStateMessages.length === 1 &&
    runtimeStateMessages[0]?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE &&
    runtimeStateMessages[0]?.content === runtimeState.content &&
    runtimeStateIndex === (expectedRuntimeStateIndex < 0 ? withoutRuntimeState.length : expectedRuntimeStateIndex);
  if (unchanged) return source;
  if (options.anchor) return insertAnchoredRuntimeState(withoutRuntimeState, runtimeState, options.anchor);
  return insertRuntimeStateBeforeFirstUser(withoutRuntimeState, runtimeState);
}

/** Caller-owned memory of where the current Runtime State was placed; reset it when history is replaced. */
export interface RuntimeStateAnchor {
  content?: string;
  index?: number;
}

// Unchanged state keeps its position so the cached prefix survives; changed state is placed before the
// latest user message so earlier input is not rewritten, and then stays at that position.
function insertAnchoredRuntimeState(
  messages: readonly FreeflowContextMessage[],
  runtimeState: FreeflowContextMessage,
  anchor: RuntimeStateAnchor,
): FreeflowContextMessage[] {
  let index: number;
  if (anchor.content === runtimeState.content && anchor.index !== undefined && anchor.index <= messages.length)
    index = anchor.index;
  else if (anchor.content === undefined) {
    const first = firstUserMessageIndex(messages);
    index = first < 0 ? messages.length : first;
  } else {
    let latest = messages.length;
    for (let i = messages.length - 1; i >= 0; i -= 1)
      if (messages[i]?.role === "user") {
        latest = i;
        break;
      }
    index = latest;
  }
  anchor.content = runtimeState.content as string;
  anchor.index = index;
  return [...messages.slice(0, index), runtimeState, ...messages.slice(index)];
}
