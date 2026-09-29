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
function bootstrapEntryComponents(entry) {
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
export function filterBootstrapMessage(message) {
  return bootstrapEntryComponents(message).length === 0 ? message : undefined;
}
function publicCognitiveRoutingControl(controlMode) {
  if (controlMode === "automatic") return "automatic";
  if (["manual-helper", "manual-executor", "manual-coordinator"].includes(controlMode)) return "manual";
  return "unavailable";
}
function publicCognitiveRoutingProfile(activeProfile, effective) {
  if (effective !== true) return "unavailable";
  return ["helper", "executor", "coordinator"].includes(activeProfile) ? activeProfile : "unavailable";
}
function publicCapabilityStatus(capability) {
  if (capability?.effective === true) return "active";
  if (!capability) return "unavailable";
  const blockingCode = capability.blockingReason?.code;
  if (blockingCode && blockingCode !== "disabled") return "unavailable";
  return "inactive";
}
function publicCognitiveRoutingStatus(capability, runtime) {
  if (runtime?.runtimeStatus === "inactive") return "inactive";
  return publicCapabilityStatus(capability);
}
function publicCognitiveRoutingProjectionMode(capability, runtime, projectionFailure) {
  if (capability?.projection !== true) return "disabled";
  if (capability?.effective !== true) return "unavailable";
  if (String(runtime?.controlMode).startsWith("manual-")) return "manual-bypass";
  if (projectionFailure) return "blocked";
  if (runtime?.runtimeStatus === "inactive" || runtime?.runtimeStatus === "blocked") return "unavailable";
  if (runtime?.effective === true && runtime.controlMode === "automatic") return "enabled";
  return "pending";
}
export function freeflowRuntimeStateMessage(
  capabilityState,
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options = {},
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
  return {
    role: "custom",
    customType: FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE,
    content: [
      "# Freeflow Runtime State",
      "",
      "This is extension-generated runtime state. Use it to interpret the stable Freeflow guidance.",
      "",
      `Freeflow: ${freeflowStatus}`,
      "",
      "Capabilities:",
      `- Cognitive Routing: ${publicCognitiveRoutingStatus(capabilityState?.cognitiveRouting, cognitiveRoutingRuntime)}`,
      `- Tool Execution: ${publicCapabilityStatus(capabilityState?.toolExecution)}${
        capabilityState?.toolExecution?.effective === true
          ? ` · capture ${capabilityState.toolExecution.capture?.effective === true ? "active" : "inactive"} · reader enabled · workspace ${capabilityState.toolExecution.workspace?.effective === true ? (capabilityState.toolExecution.workspace.write ? "read/write" : "read-only") : "inactive"} · discovery ${capabilityState.toolExecution.discovery?.effective === true ? "active" : "inactive"} · accounting ${capabilityState.toolExecution.accounting?.effective === true ? "active" : "inactive"} · programs ${capabilityState.toolExecution.programs?.mode ?? "off"} · catalog ${options.toolExecutionRuntime?.catalog?.operations ?? 0} · adapters ${options.toolExecutionRuntime?.adapters?.announced?.filter((adapter) => adapter.active).length ?? 0}/${options.toolExecutionRuntime?.adapters?.allowed?.length ?? 0} · live effects ${options.toolExecutionRuntime?.unresolvedEffects ? `fenced (${options.toolExecutionRuntime.unresolvedEffects})` : "settled"} · native Bash built-in; custom tools require adapters · store ${options.toolExecutionRuntime?.store?.state ?? "unavailable"}${options.toolExecutionRuntime?.store?.reason ? ` (${options.toolExecutionRuntime.store.reason})` : ""} · guidance ${options.toolExecutionRuntime?.guidance?.state ?? "unobserved"}${options.toolExecutionRuntime?.lastFailure?.code ? ` · last program issue ${options.toolExecutionRuntime.lastFailure.code}` : options.toolExecutionRuntime?.failures?.at(-1)?.code ? ` · last capture issue ${options.toolExecutionRuntime.failures.at(-1).code}` : options.toolExecutionRuntime?.adapters?.failures?.at(-1)?.code ? ` · last adapter issue ${options.toolExecutionRuntime.adapters.failures.at(-1).code}` : ""}`
          : ""
      }`,
      "",
      "Cognitive Routing:",
      `- Control: \`${control}\``,
      // Under Automatic control the routing Runtime State owns the active profile, so switches do not churn this state.
      ...(control === "automatic" ? [] : [`- Profile: \`${profile}\``]),
      `- Delegation: \`${cognitiveRoutingRuntime?.delegation ?? capabilityState?.cognitiveRouting?.delegation ?? "executor"}\``,
      `- Projection: \`${projectionMode}\``,
    ].join("\n"),
    display: false,
    details: { source: "provider-request-runtime-state" },
  };
}
function withoutFreeflowRuntimeState(messages) {
  return (Array.isArray(messages) ? messages : []).filter(
    (message) =>
      message?.customType !== FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE &&
      message?.customType !== COGNITIVE_ROUTING_RUNTIME_STATE_MESSAGE_TYPE,
  );
}
function firstUserMessageIndex(messages) {
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}
function insertRuntimeStateBeforeFirstUser(messages, runtimeState) {
  const firstUserIndex = firstUserMessageIndex(messages);
  if (firstUserIndex < 0) return [...messages, runtimeState];
  return [...messages.slice(0, firstUserIndex), runtimeState, ...messages.slice(firstUserIndex)];
}
export function withFreeflowRuntimeState(
  messages,
  capabilityState,
  cognitiveRoutingRuntime = undefined,
  freeflowContext = undefined,
  options = {},
) {
  const source = Array.isArray(messages) ? messages : [];
  const runtimeState = freeflowRuntimeStateMessage(capabilityState, cognitiveRoutingRuntime, freeflowContext, {
    projectionFailure: options.projectionFailure,
    toolExecutionRuntime: options.toolExecutionRuntime,
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
// Unchanged state keeps its position so the cached prefix survives; changed state is placed before the
// latest user message so earlier input is not rewritten, and then stays at that position.
function insertAnchoredRuntimeState(messages, runtimeState, anchor) {
  let index;
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
  anchor.content = runtimeState.content;
  anchor.index = index;
  return [...messages.slice(0, index), runtimeState, ...messages.slice(index)];
}
