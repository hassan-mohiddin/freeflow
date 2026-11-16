import { ignoredStateLine, reviewStateLine, skillsStateLine } from "./config-validation.js";
import { hasUsableMandatoryPrompts } from "./prompts.js";

/**
 * The Freeflow Runtime State message: what is active this request, placed so unchanged state keeps its cached
 * position and changed state never rewrites earlier input. Also drops bootstrap messages that older Freeflow
 * versions saved in sessions.
 */
export const FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE = "freeflow-runtime-state";

/** The Runtime State line for a folder with no shared config file, word for word (D-045, round 3). */
const SETUP_NEEDED_INSTRUCTION =
  "Freeflow is installed, but this folder has no .freeflow/config.json. Before other work, tell the user and set Freeflow up here with the Setup Freeflow skill, which asks them for the choices that are theirs; if they decline, work without Freeflow.";

// Runtime State and bootstrap messages that older Freeflow versions sent or saved in sessions, under a feature's own
// type (`freeflow-<feature>-runtime-state`, `freeflow-<feature>-bootstrap`) or as one `freeflow-bootstrap` naming its
// components; they are never sent again.
const LEGACY_RUNTIME_STATE = /^freeflow-[a-z0-9-]+-runtime-state$/;
const LEGACY_BOOTSTRAP = /^freeflow-[a-z0-9-]+-bootstrap$/;
const BOOTSTRAP_MARKER = /<!-- freeflow-bootstrap:[a-z0-9-]+ -->/;

function isLegacyBootstrap(entry: any) {
  const isCustomMessage = entry?.role === "custom" || entry?.type === "custom_message" || entry?.type === "custom";
  if (!isCustomMessage || typeof entry.customType !== "string") return false;
  if (entry.customType === "freeflow-bootstrap")
    return Array.isArray(entry.details?.components)
      ? entry.details.components.length > 0
      : typeof entry.content === "string" && BOOTSTRAP_MARKER.test(entry.content);
  return LEGACY_BOOTSTRAP.test(entry.customType);
}

export function filterBootstrapMessage(message: any) {
  return isLegacyBootstrap(message) ? undefined : message;
}

const isRuntimeState = (message: any) =>
  message?.customType === FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE ||
  (typeof message?.customType === "string" && LEGACY_RUNTIME_STATE.test(message.customType));

type FreeflowContextMessage = {
  customType?: unknown;
  [key: string]: unknown;
};

function publicCapabilityStatus(capability: any) {
  if (capability?.effective === true) return "active";
  if (!capability) return "unavailable";
  const blockingCode = capability.blockingReason?.code;
  if (blockingCode && blockingCode !== "disabled") return "unavailable";
  return "inactive";
}

export function freeflowRuntimeStateMessage(
  capabilityState: any,
  freeflowContext: any = undefined,
  options: {
    /** Freeflow skills already read in this context, by name. */
    skills?: readonly string[];
  } = {},
) {
  const mandatoryPromptAvailable = capabilityState?.enabled !== true || hasUsableMandatoryPrompts(freeflowContext);
  const freeflowStatus = capabilityState?.setupNeeded
    ? "setup needed"
    : capabilityState?.enabled
      ? mandatoryPromptAvailable
        ? "active"
        : "unavailable"
      : "inactive";
  // With the setup needed, the agent is told to set Freeflow up here, and what to do if the user declines (D-045, round 3).
  const setupLine = capabilityState?.setupNeeded ? [SETUP_NEEDED_INSTRUCTION] : [];
  // Only a choice the user made: the default adds nothing, so most users' state stays as it was.
  const review = freeflowStatus === "active" ? reviewStateLine(capabilityState?.review) : null;
  const skillsOff = freeflowStatus === "active" ? skillsStateLine(capabilityState?.skills?.off) : null;
  // A setting a config file ignores is named whatever the status, so the user sees it (D-045).
  const ignored = ignoredStateLine(capabilityState?.ignored ?? []);

  return {
    role: "custom",
    customType: FREEFLOW_RUNTIME_STATE_MESSAGE_TYPE,
    content: [
      "# Freeflow Runtime State",
      "",
      "This is extension-generated runtime state. Use it to interpret the stable Freeflow guidance.",
      "",
      `Freeflow: ${freeflowStatus}`,
      ...setupLine,
      ...(review ? [review] : []),
      ...(skillsOff ? [skillsOff] : []),
      ...(ignored ? [ignored] : []),
      "",
      "Capabilities:",
      `- Tool Execution: ${publicCapabilityStatus(capabilityState?.toolExecution)}`,
      ...(capabilityState?.messaging?.enabled
        ? [`- Messaging: ${publicCapabilityStatus(capabilityState.messaging)}`]
        : []),
      ...(options.skills?.length ? ["", `Freeflow skills read in this context: ${options.skills.join(", ")}`] : []),
    ].join("\n"),
    display: false,
    details: { source: "provider-request-runtime-state" },
  };
}

function withoutFreeflowRuntimeState(messages: readonly FreeflowContextMessage[] | undefined) {
  return (Array.isArray(messages) ? messages : []).filter((message) => !isRuntimeState(message));
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
  freeflowContext: any = undefined,
  options: {
    force?: boolean;
    anchor?: RuntimeStateAnchor;
    skills?: readonly string[];
    // The message the caller built for this request, so the caller can log the same text it placed.
    runtimeState?: ReturnType<typeof freeflowRuntimeStateMessage>;
  } = {},
) {
  const source = Array.isArray(messages) ? messages : [];
  const runtimeState =
    options.runtimeState ?? freeflowRuntimeStateMessage(capabilityState, freeflowContext, { skills: options.skills });
  const runtimeStateMessages = source.filter(isRuntimeState);
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
