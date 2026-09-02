import {
  COGNITIVE_ROUTING_CONTROL_ENTRY,
  COGNITIVE_ROUTING_INACTIVE_ENTRY,
  COGNITIVE_ROUTING_INTENT_ENTRY,
} from "./cognitive-routing/controller.js";
import { PiRoutingSession } from "./cognitive-routing/pi-routing-session.js";
import {
  cognitiveRoutingProfileCompletions,
  handleCognitiveRoutingProfileCommand,
} from "./cognitive-routing/commands.js";
import { registerCognitiveRoutingHistoryTool, registerCognitiveRoutingTool } from "./cognitive-routing/tool.js";
import { readCognitiveRoutingHistory } from "./cognitive-routing/history.js";
import { ConversationHistoryRuntime } from "./conversation-history/runtime.js";
import { FreeflowContextRuntime } from "./freeflow-context/runtime.js";
import { CONTEXT_VIRTUALIZATION_TOOL_NAME, registerFreeflowContextTool } from "./freeflow-context/tool.js";
import { handleContextCommand } from "./context-virtualization/commands.js";
import { ContextVirtualizationRuntime } from "./context-virtualization/runtime.js";
import { handleFreeflowCommand } from "./settings/settings-ui.js";
import { isPiFlowHost } from "./runtime/runtime-identity.js";
import {
  CONTRIBUTOR_COMMANDS,
  COGNITIVE_ROUTING_SWITCH_TOOL_NAME,
  WORKFLOW_COMMANDS,
  freeflowModelSkillPaths,
  freeflowSkillPath,
  getRuntimeContext,
  hasUsableMandatoryPrompts,
  isPromptAvailable,
  readCapabilityState,
  refreshRuntimeContext,
  restoreSessionOverrides,
  runtimeContext,
  filterBootstrapMessage,
  setFreeflowStatus,
  skillPrompt,
  withFreeflowContextRecoveryMessage,
  withFreeflowRuntimeState,
} from "./runtime/runtime-context.js";
function unavailableCapability(capability, code, message) {
  return {
    ...capability,
    effective: false,
    blockingReason: { code, message },
  };
}
function modelFacingCapabilityState(
  capabilityState,
  freeflowContext,
  routingSnapshot,
  cognitiveRoutingActivationFailed = false,
) {
  const surfaceState = {
    ...capabilityState,
    contextVirtualization: { ...capabilityState?.contextVirtualization },
    conversationHistory: { ...capabilityState?.conversationHistory },
    cognitiveRouting: { ...capabilityState?.cognitiveRouting },
  };
  if (surfaceState.enabled !== true) return surfaceState;
  const markUnavailable = (key, message) => {
    if (surfaceState[key]?.effective === true) {
      surfaceState[key] = unavailableCapability(surfaceState[key], "unavailable", message);
    }
  };
  if (!hasUsableMandatoryPrompts(freeflowContext)) {
    for (const key of ["contextVirtualization", "conversationHistory", "cognitiveRouting"]) {
      markUnavailable(key, "Mandatory Freeflow prompt is unavailable.");
    }
    return surfaceState;
  }
  if (
    surfaceState.contextVirtualization?.effective === true &&
    !isPromptAvailable(freeflowContext.contextVirtualizationPrompt)
  ) {
    markUnavailable("contextVirtualization", "Context Virtualization prompt is unavailable.");
  }
  if (
    surfaceState.conversationHistory?.effective === true &&
    !isPromptAvailable(freeflowContext.conversationHistoryPrompt)
  ) {
    markUnavailable("conversationHistory", "Conversation History prompt is unavailable.");
  }
  if (surfaceState.cognitiveRouting?.effective === true) {
    const controllerState = routingSnapshot.runtimeState;
    if (routingSnapshot.disposition === "blocked") {
      surfaceState.cognitiveRouting = unavailableCapability(
        surfaceState.cognitiveRouting,
        "runtime_blocked",
        routingSnapshot.reason ?? "Cognitive Routing is blocked because its inactive state could not be persisted.",
      );
    } else if (routingSnapshot.startupSelectionSuppressed || routingSnapshot.disposition === "inactive") {
      surfaceState.cognitiveRouting = unavailableCapability(
        surfaceState.cognitiveRouting,
        "runtime_inactive",
        "Cognitive Routing is inactive because Pi owns the startup model or thinking level.",
      );
    } else if (controllerState?.runtimeStatus === "inactive") {
      surfaceState.cognitiveRouting = unavailableCapability(
        surfaceState.cognitiveRouting,
        "runtime_inactive",
        controllerState.runtimeReason ?? "Cognitive Routing is inactive because Pi owns the current model state.",
      );
    } else if (controllerState?.runtimeStatus === "blocked") {
      surfaceState.cognitiveRouting = unavailableCapability(
        surfaceState.cognitiveRouting,
        "runtime_blocked",
        controllerState.runtimeReason ?? "Cognitive Routing is blocked because its state is not proven.",
      );
    } else if (cognitiveRoutingActivationFailed || controllerState?.effective === false) {
      surfaceState.cognitiveRouting = unavailableCapability(
        surfaceState.cognitiveRouting,
        "unavailable",
        "Cognitive Routing could not activate for this session.",
      );
    } else if (!isPromptAvailable(freeflowContext.cognitiveRoutingPrompt)) {
      markUnavailable("cognitiveRouting", "Cognitive Routing prompt is unavailable.");
    }
  }
  return surfaceState;
}
function sessionEntries(ctx) {
  try {
    const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}
function sessionHasConversationState(ctx) {
  return sessionEntries(ctx).some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry;
    return (
      typeof record.type === "string" &&
      ["message", "custom_message", "compaction", "branch_summary"].includes(record.type)
    );
  });
}
function sessionHasConversationOrRoutingState(ctx) {
  return (
    sessionHasConversationState(ctx) ||
    sessionEntries(ctx).some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry;
      return (
        record.type === "custom" &&
        (record.customType === COGNITIVE_ROUTING_INTENT_ENTRY ||
          record.customType === COGNITIVE_ROUTING_CONTROL_ENTRY ||
          record.customType === COGNITIVE_ROUTING_INACTIVE_ENTRY)
      );
    })
  );
}
async function applyCapabilityToolVisibility(
  pi,
  ctx,
  capabilityState = undefined,
  routingSnapshot = {
    status: "available",
    disposition: "available",
    startupSelectionSuppressed: false,
  },
) {
  if (typeof pi?.setActiveTools !== "function" || typeof pi?.getAllTools !== "function") return;
  const state = capabilityState ?? (await readCapabilityState(ctx.cwd, ctx, pi?.host));
  const allToolNames = pi
    .getAllTools()
    .map((tool) => tool?.name)
    .filter(Boolean);
  const allToolNameSet = new Set(allToolNames);
  const currentActive = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : undefined;
  const active = new Set(
    (Array.isArray(currentActive) ? currentActive : allToolNames).filter((name) => allToolNameSet.has(name)),
  );
  if (allToolNameSet.has(COGNITIVE_ROUTING_SWITCH_TOOL_NAME)) {
    const controllerState = routingSnapshot.runtimeState;
    const routingToolActive =
      state.cognitiveRouting?.effective === true &&
      controllerState?.effective === true &&
      controllerState.controlMode === "automatic";
    if (routingToolActive) active.add(COGNITIVE_ROUTING_SWITCH_TOOL_NAME);
    else active.delete(COGNITIVE_ROUTING_SWITCH_TOOL_NAME);
  }
  if (allToolNameSet.has(CONTEXT_VIRTUALIZATION_TOOL_NAME)) {
    if (state.contextVirtualization?.effective === true || state.conversationHistory?.effective === true) {
      active.add(CONTEXT_VIRTUALIZATION_TOOL_NAME);
    } else {
      active.delete(CONTEXT_VIRTUALIZATION_TOOL_NAME);
    }
  }
  pi.setActiveTools([...active]);
}
function disabledToolCall(toolName, capability) {
  const command = capability === "freeflow" ? "/freeflow settings" : `/${capability} settings`;
  return {
    block: true,
    reason: `${toolName} is disabled by Freeflow config. Configure ${capability} with ${command}.`,
  };
}
function freeflowCompletions(prefix, cognitiveRoutingAvailable = false) {
  const query = prefix ?? "";
  if (query.startsWith("settings ")) {
    const settingsQuery = query.slice("settings ".length);
    return [
      { value: "session", label: "session", description: "Override Freeflow for this Pi session" },
      { value: "local", label: "local", description: "Edit personal overrides for this repository" },
      { value: "repo", label: "repo", description: "Edit shared repository settings" },
    ]
      .filter((item) => item.value.startsWith(settingsQuery))
      .map((item) => ({ ...item, value: `settings ${item.value}` }));
  }
  if (cognitiveRoutingAvailable && query.startsWith("profile ")) {
    return cognitiveRoutingProfileCompletions(query.slice("profile ".length)).map((item) => ({
      ...item,
      value: `profile ${item.value}`,
    }));
  }
  if (query.startsWith("context ")) {
    const contextQuery = query.slice("context ".length);
    return [
      { value: "status", label: "status", description: "Show Freeflow Context state" },
      { value: "list", label: "list", description: "List archived context projections" },
      { value: "restore", label: "restore", description: "Restore one or more context references" },
      { value: "reset all", label: "reset all", description: "Reset projection decisions on the active branch" },
    ]
      .filter((item) => item.value.startsWith(contextQuery))
      .map((item) => ({ ...item, value: `context ${item.value}` }));
  }
  return [
    { value: "settings", label: "settings", description: "Open personal override settings" },
    { value: "status", label: "status", description: "Show effective Freeflow state" },
    { value: "context", label: "context", description: "Inspect Freeflow Context" },
    ...(cognitiveRoutingAvailable
      ? [{ value: "profile", label: "profile", description: "Hold or release Cognitive Routing profile control" }]
      : []),
    { value: "enable", label: "enable", description: "Enable Freeflow for this repository" },
    { value: "disable", label: "disable", description: "Disable Freeflow for this repository" },
  ].filter((item) => item.value.startsWith(query));
}
function bypassCompletions(prefix) {
  const query = prefix ?? "";
  return [
    { value: "next", label: "next", description: "Skip one optional step" },
    { value: "task", label: "task", description: "Reduce optional pressure for the current task" },
  ].filter((item) => item.value.startsWith(query));
}
async function sendSkillCommand(pi, ctx, skill, args) {
  const state = await readCapabilityState(ctx.cwd, ctx, pi?.host);
  if (skill === "setup-freeflow" && !state.configured) {
    await pi.sendUserMessage(skillPrompt(skill, args), { expandPromptTemplates: true });
    return;
  }
  if (!state.configured) {
    ctx.ui.notify("Freeflow is installed but this repo is not set up. Run /setup-freeflow first.", "warning");
    return;
  }
  if (!state.enabled) {
    ctx.ui.notify(
      "Freeflow is disabled for this repo. Use /freeflow enable or /freeflow settings to re-enable it.",
      "warning",
    );
    return;
  }
  const freeflowContext = await getRuntimeContext(state);
  if (!hasUsableMandatoryPrompts(freeflowContext)) {
    ctx.ui.notify("Freeflow core prompts are unavailable; the requested skill cannot be dispatched.", "warning");
    return;
  }
  await pi.sendUserMessage(skillPrompt(skill, args), { expandPromptTemplates: true });
}
export default function freeflow(pi) {
  // SAFETY: These helpers register complete Pi tool definitions but retain legacy structural typing for PiFlow compatibility.
  const toolRegistrar = pi;
  const routingSession = new PiRoutingSession({ pi, stockPi: !isPiFlowHost(pi?.host) });
  let latestCognitiveRoutingContext;
  let providerSurfaceSnapshot;
  let runtimeStateRefreshRequired = true;
  let contextRecoveryGeneration = 0;
  let contextRecoverySettledGeneration = 0;
  let contextRecoveryProjectedGeneration;
  let freeflowContextRuntime;
  let contextVirtualizationRuntime;
  let conversationHistoryRuntime;
  const registerContextToolForState = (capabilityState) => {
    registerFreeflowContextTool(
      toolRegistrar,
      () => contextVirtualizationRuntime,
      () => conversationHistoryRuntime,
      {
        contextVirtualization: capabilityState?.contextVirtualization?.effective === true,
        conversationHistory: capabilityState?.conversationHistory?.effective === true,
      },
    );
  };
  const canRecoverContext = (capabilityState, freeflowContext) =>
    capabilityState?.enabled === true && hasUsableMandatoryPrompts(freeflowContext);
  const queueContextRecovery = () => {
    contextRecoveryGeneration += 1;
  };
  const buildProviderSurface = async (ctx, activateCognitiveRouting = false) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    const freeflowContext = await getRuntimeContext(capabilityState);
    const promptCapabilityState = modelFacingCapabilityState(
      capabilityState,
      freeflowContext,
      routingSession.snapshot(),
    );
    let activationAttempted = false;
    if (
      activateCognitiveRouting &&
      routingSession.canAutoActivate() &&
      (!routingSession.hasController() || promptCapabilityState.cognitiveRouting?.effective !== true)
    ) {
      activationAttempted = promptCapabilityState.cognitiveRouting?.effective === true;
      try {
        await routingSession.reconcileController(
          ctx,
          promptCapabilityState,
          routingSession.armed ? { ...routingSession.armed } : undefined,
        );
        if (routingSession.hasController()) {
          routingSession.clearArmed();
          if (routingSession.snapshot().status === "active") routingSession.markActive();
        }
      } catch {
        routingSession.clearController();
      }
    }
    const surfaceCapabilityState = modelFacingCapabilityState(
      promptCapabilityState,
      freeflowContext,
      routingSession.snapshot(),
      activationAttempted && !routingSession.hasController(),
    );
    const routingSnapshot = routingSession.snapshot();
    return {
      capabilityState: surfaceCapabilityState,
      freeflowContext,
      cognitiveRoutingRuntime: routingSnapshot.runtimeState,
      configuredCapabilityState: capabilityState,
    };
  };
  const applyLiveCapabilityStateForSession = async (ctx, options = {}) => {
    providerSurfaceSnapshot = undefined;
    await routingSession.applyLiveCapabilityState(ctx, options);
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    const freeflowContext = await getRuntimeContext(capabilityState);
    const surfaceCapabilityState = modelFacingCapabilityState(
      capabilityState,
      freeflowContext,
      routingSession.snapshot(),
    );
    const routingSnapshot = routingSession.snapshot();
    setFreeflowStatus(ctx, surfaceCapabilityState, routingSnapshot.runtimeState, freeflowContext, {
      startupSelectionSuppressed: routingSnapshot.startupSelectionSuppressed,
    });
    await applyCapabilityToolVisibility(pi, ctx, surfaceCapabilityState, routingSnapshot);
    registerContextToolForState(surfaceCapabilityState);
    return { capabilityState: surfaceCapabilityState, freeflowContext };
  };
  if (routingSession.supportsCognitiveRoutingRuntime()) {
    registerCognitiveRoutingTool(toolRegistrar, () => routingSession.controllerForTool());
    registerCognitiveRoutingHistoryTool(toolRegistrar, (options, context) => {
      return (
        routingSession.history(options) ??
        readCognitiveRoutingHistory(context ?? latestCognitiveRoutingContext, options)
      );
    });
  }
  registerFreeflowContextTool(
    toolRegistrar,
    () => contextVirtualizationRuntime,
    () => conversationHistoryRuntime,
    { contextVirtualization: false, conversationHistory: false },
  );
  if (routingSession.supportsCognitiveRoutingRuntime() && typeof pi.registerShortcut === "function") {
    pi.registerShortcut("ctrl+shift+r", {
      description: "Cycle the Cognitive Routing manual standard/reasoning hold",
      handler: async (ctx) => {
        if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) {
          ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
          return;
        }
        const armedCycle = routingSession.hasController() ? undefined : routingSession.cycleArmedManual();
        if (armedCycle) {
          routingSession.beginExplicitReactivation();
          ctx.ui?.notify?.(`Cognitive Routing manual hold set to ${armedCycle.target}.`, "info");
          await applyLiveCapabilityStateForSession(ctx, {
            reconcileCognitiveRouting: true,
            materializeCognitiveRouting: !isPiFlowHost(pi?.host),
          });
          return;
        }
        if (!routingSession.hasController()) {
          routingSession.beginExplicitReactivation();
          await applyLiveCapabilityStateForSession(ctx, { reconcileCognitiveRouting: true });
        }
        const state = routingSession.snapshot().runtimeState;
        if (!state) {
          ctx.ui?.notify?.("Cognitive Routing is unavailable for this session.", "warning");
          return;
        }
        const target = state.activeProfile === "reasoning" ? "standard" : "reasoning";
        const result = await routingSession.setManualProfile(target, "profile-shortcut");
        if (result.status === "active") {
          ctx.ui?.notify?.(`Cognitive Routing manual hold set to ${target}.`, "info");
        } else {
          ctx.ui?.notify?.(`Cognitive Routing could not set the manual profile: ${result.reason}.`, "warning");
        }
        await applyLiveCapabilityStateForSession(ctx);
      },
    });
    pi.registerShortcut("ctrl+shift+a", {
      description: "Set Cognitive Routing to automatic Reasoning control",
      handler: async (ctx) => {
        if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) {
          ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
          return;
        }
        const armedCycle = routingSession.hasController() ? undefined : routingSession.cycleArmedAutomatic();
        if (armedCycle) {
          if (!armedCycle.changed) {
            ctx.ui?.notify?.("Cognitive Routing automatic control active.", "info");
            return;
          }
          ctx.ui?.notify?.("Cognitive Routing automatic control active.", "info");
          routingSession.beginExplicitReactivation();
          await applyLiveCapabilityStateForSession(ctx, {
            reconcileCognitiveRouting: true,
            materializeCognitiveRouting: !isPiFlowHost(pi?.host),
          });
          return;
        }
        if (!routingSession.hasController()) {
          routingSession.beginExplicitReactivation();
          await applyLiveCapabilityStateForSession(ctx, { reconcileCognitiveRouting: true });
        }
        const result = await routingSession.setAutomaticControl("profile-shortcut");
        if (result.status === "automatic") {
          ctx.ui?.notify?.("Cognitive Routing automatic control active.", "info");
        } else {
          ctx.ui?.notify?.(`Cognitive Routing could not change control: ${result.reason}.`, "warning");
        }
        await applyLiveCapabilityStateForSession(ctx);
      },
    });
  }
  if (!isPiFlowHost(pi?.host) && routingSession.supportsCognitiveRoutingRuntime()) {
    pi.on("model_select", async (event, ctx) => {
      if (!routingSession.hasController()) {
        if (!routingSession.armed) return;
        routingSession.clearArmed();
        routingSession.observeArmedNativeChange(ctx, "Pi model selection");
        await applyLiveCapabilityStateForSession(ctx);
        return;
      }
      const result = await routingSession.observeNativeChange("Pi model selection", event?.source);
      if (result.status !== "ignored") {
        latestCognitiveRoutingContext = ctx;
        providerSurfaceSnapshot = undefined;
        await applyLiveCapabilityStateForSession(ctx);
      }
    });
    pi.on("thinking_level_select", async (_event, ctx) => {
      if (!routingSession.hasController()) {
        if (!routingSession.armed) return;
        routingSession.clearArmed();
        routingSession.observeArmedNativeChange(ctx, "Pi thinking-level selection");
        await applyLiveCapabilityStateForSession(ctx);
        return;
      }
      const result = await routingSession.observeNativeChange("Pi thinking-level selection");
      if (result.status !== "ignored") {
        latestCognitiveRoutingContext = ctx;
        providerSurfaceSnapshot = undefined;
        await applyLiveCapabilityStateForSession(ctx);
      }
    });
  }
  pi.on("resources_discover", async (event, ctx) => {
    const cwd = ctx?.cwd ?? event?.cwd ?? process.cwd();
    const snapshot =
      providerSurfaceSnapshot?.context === ctx
        ? providerSurfaceSnapshot.value
        : await buildProviderSurface(ctx ?? { cwd }, false);
    const state = snapshot.capabilityState;
    if (!state.configured) {
      return { skillPaths: [freeflowSkillPath("setup-freeflow")] };
    }
    if (!state.enabled || !hasUsableMandatoryPrompts(snapshot.freeflowContext)) {
      return { skillPaths: [] };
    }
    return { skillPaths: freeflowModelSkillPaths(state) };
  });
  pi.on("session_start", async (event, ctx) => {
    routingSession.resetForSession(ctx, event);
    latestCognitiveRoutingContext = ctx;
    providerSurfaceSnapshot = undefined;
    runtimeStateRefreshRequired = true;
    contextRecoveryGeneration = 0;
    contextRecoverySettledGeneration = 0;
    contextRecoveryProjectedGeneration = undefined;
    restoreSessionOverrides(ctx);
    freeflowContextRuntime = new FreeflowContextRuntime(ctx);
    contextVirtualizationRuntime = new ContextVirtualizationRuntime(pi, ctx, freeflowContextRuntime);
    conversationHistoryRuntime = new ConversationHistoryRuntime(
      ctx,
      (entryId) => contextVirtualizationRuntime?.isSourceFullyProjected(entryId) ?? true,
      freeflowContextRuntime,
    );
    await contextVirtualizationRuntime.recover(ctx);
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    await refreshRuntimeContext(capabilityState);
    routingSession.ensureStartupInactive(ctx, capabilityState.cognitiveRouting?.effective === true);
    routingSession.reconcileNativeEntries(ctx);
    const hasSessionState = sessionHasConversationOrRoutingState(ctx);
    const snapshot = await buildProviderSurface(ctx, hasSessionState);
    if (
      !hasSessionState &&
      snapshot.capabilityState?.cognitiveRouting?.effective === true &&
      routingSession.canAutoActivate()
    ) {
      routingSession.armFromCapability(snapshot.capabilityState.cognitiveRouting);
    } else {
      routingSession.clearArmed();
    }
    if (
      (event?.reason === "resume" || (event?.reason === "startup" && sessionHasConversationState(ctx))) &&
      canRecoverContext(snapshot.capabilityState, snapshot.freeflowContext)
    ) {
      queueContextRecovery();
    }
    registerContextToolForState(snapshot.capabilityState);
    const routingSnapshot = routingSession.snapshot();
    setFreeflowStatus(
      ctx,
      snapshot.capabilityState,
      snapshot.cognitiveRoutingRuntime ?? routingSnapshot.runtimeState,
      snapshot.freeflowContext,
      { startupSelectionSuppressed: routingSnapshot.startupSelectionSuppressed },
    );
    await applyCapabilityToolVisibility(pi, ctx, snapshot.capabilityState, routingSnapshot);
  });
  pi.on("agent_settled", async (_event, ctx) => {
    if (contextRecoveryProjectedGeneration === contextRecoveryGeneration) {
      contextRecoverySettledGeneration = contextRecoveryGeneration;
      contextRecoveryProjectedGeneration = undefined;
    }
    if (!routingSession.hasController()) return undefined;
    await applyLiveCapabilityStateForSession(ctx);
    return undefined;
  });
  pi.on("session_shutdown", async (event) => {
    await routingSession.shutdown(event?.reason);
    providerSurfaceSnapshot = undefined;
    freeflowContextRuntime = undefined;
    contextVirtualizationRuntime = undefined;
    conversationHistoryRuntime = undefined;
  });
  pi.on("session_tree", async (event, ctx) => {
    latestCognitiveRoutingContext = ctx;
    providerSurfaceSnapshot = undefined;
    runtimeStateRefreshRequired = true;
    restoreSessionOverrides(ctx);
    await routingSession.reconcileBranch();
    if (contextVirtualizationRuntime) {
      contextVirtualizationRuntime.setContext(ctx);
      await contextVirtualizationRuntime.recover(ctx);
    }
    conversationHistoryRuntime?.setContext(ctx);
    const surface = await applyLiveCapabilityStateForSession(ctx);
    if (event?.summaryEntry && canRecoverContext(surface.capabilityState, surface.freeflowContext)) {
      queueContextRecovery();
    }
  });
  pi.on("session_compact", async (_event, ctx) => {
    latestCognitiveRoutingContext = ctx;
    providerSurfaceSnapshot = undefined;
    runtimeStateRefreshRequired = true;
    await routingSession.reconcileBranch("session-compact");
    if (contextVirtualizationRuntime) {
      contextVirtualizationRuntime.setContext(ctx);
      await contextVirtualizationRuntime.recover(ctx);
    }
    conversationHistoryRuntime?.setContext(ctx);
    const surface = await applyLiveCapabilityStateForSession(ctx);
    if (canRecoverContext(surface.capabilityState, surface.freeflowContext)) queueContextRecovery();
  });
  pi.on("before_agent_start", async (event, ctx) => {
    latestCognitiveRoutingContext = ctx;
    const snapshot = await buildProviderSurface(ctx, true);
    providerSurfaceSnapshot = { context: ctx, value: snapshot };
    registerContextToolForState(snapshot.capabilityState);
    const routingSnapshot = routingSession.snapshot();
    setFreeflowStatus(ctx, snapshot.capabilityState, snapshot.cognitiveRoutingRuntime, snapshot.freeflowContext, {
      startupSelectionSuppressed: routingSnapshot.startupSelectionSuppressed,
    });
    await applyCapabilityToolVisibility(pi, ctx, snapshot.capabilityState, routingSnapshot);
    const freeflowRuntimeContext = runtimeContext(snapshot.freeflowContext, snapshot.capabilityState);
    const systemPrompt = freeflowRuntimeContext
      ? `${event.systemPrompt}\n\n${freeflowRuntimeContext}`
      : event.systemPrompt;
    return { systemPrompt };
  });
  pi.on("context", async (event, ctx) => {
    const snapshot =
      providerSurfaceSnapshot?.context === ctx ? providerSurfaceSnapshot.value : await buildProviderSurface(ctx, false);
    if (providerSurfaceSnapshot?.context === ctx) providerSurfaceSnapshot = undefined;
    const cognitiveRoutingRuntime = snapshot.cognitiveRoutingRuntime;
    const surfaceCapabilityState = snapshot.capabilityState;
    let changed = false;
    let messages = event.messages
      .map((message) => {
        const filtered = filterBootstrapMessage(message);
        if (filtered !== message) changed = true;
        return filtered;
      })
      .filter((message) => message !== undefined);
    if (contextVirtualizationRuntime) {
      contextVirtualizationRuntime.setContext(ctx);
      const projected = await contextVirtualizationRuntime.project(
        messages,
        surfaceCapabilityState.contextVirtualization?.effective === true,
      );
      if (projected.changed) {
        changed = true;
        messages = projected.messages;
      }
    }
    if (conversationHistoryRuntime && surfaceCapabilityState.conversationHistory?.effective === true) {
      conversationHistoryRuntime.setContext(ctx);
      conversationHistoryRuntime.capture(surfaceCapabilityState.contextVirtualization?.effective === true);
    }
    const forceRuntimeStateRefresh = runtimeStateRefreshRequired;
    const nextMessages = withFreeflowRuntimeState(
      messages,
      surfaceCapabilityState,
      cognitiveRoutingRuntime,
      snapshot.freeflowContext,
      { force: forceRuntimeStateRefresh },
    );
    if (nextMessages !== messages) {
      changed = true;
      messages = nextMessages;
    }
    if (forceRuntimeStateRefresh) runtimeStateRefreshRequired = false;
    const recoveryRequired = contextRecoveryGeneration > contextRecoverySettledGeneration;
    const injectRecoveryMessage =
      recoveryRequired && canRecoverContext(surfaceCapabilityState, snapshot.freeflowContext);
    const messagesWithRecovery = withFreeflowContextRecoveryMessage(messages, injectRecoveryMessage);
    if (messagesWithRecovery !== messages) {
      changed = true;
      messages = messagesWithRecovery;
    }
    if (injectRecoveryMessage) contextRecoveryProjectedGeneration = contextRecoveryGeneration;
    return changed ? { messages } : undefined;
  });
  pi.on("tool_call", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    if (
      capabilityState.contextVirtualization?.effective !== true &&
      capabilityState.conversationHistory?.effective !== true &&
      toolName === CONTEXT_VIRTUALIZATION_TOOL_NAME
    ) {
      return disabledToolCall(toolName, "context");
    }
    return undefined;
  });
  pi.on("tool_result", async (event, ctx) => {
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    if (routingSession.supportsCognitiveRoutingRuntime() && toolName === COGNITIVE_ROUTING_SWITCH_TOOL_NAME) {
      await applyLiveCapabilityStateForSession(ctx);
    }
    return undefined;
  });
  for (const { command, skill } of WORKFLOW_COMMANDS) {
    pi.registerCommand(command, {
      description: command === skill ? `Run Freeflow ${skill}` : `Run Freeflow ${skill} via ${command}`,
      ...(command === "bypass" ? { getArgumentCompletions: bypassCompletions } : {}),
      handler: async (args, ctx) => {
        await sendSkillCommand(pi, ctx, skill, args);
      },
    });
  }
  for (const skill of CONTRIBUTOR_COMMANDS) {
    pi.registerCommand(skill, {
      description: `Run Freeflow ${skill}`,
      handler: async (args, ctx) => {
        await sendSkillCommand(pi, ctx, skill, args);
      },
    });
  }
  pi.registerCommand("freeflow", {
    description: "Open unified Freeflow settings or print compact status",
    getArgumentCompletions: (prefix) => freeflowCompletions(prefix, routingSession.supportsCognitiveRoutingRuntime()),
    handler: async (args, ctx) => {
      const contextInput = (args ?? "").trim();
      if (contextInput === "context" || contextInput.startsWith("context ")) {
        const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
        await handleContextCommand(
          contextInput.slice("context".length).trim(),
          ctx,
          contextVirtualizationRuntime,
          capabilityState.contextVirtualization?.effective === true,
          capabilityState.conversationHistory?.effective === true,
        );
        return;
      }
      if (routingSession.supportsCognitiveRoutingRuntime() && /^profile(?:\s|$)/i.test((args ?? "").trim())) {
        const profileCommandContext = {
          isIdle: ctx?.isIdle,
          ui: ctx?.ui,
          history: (options) => routingSession.history(options) ?? readCognitiveRoutingHistory(ctx, options),
        };
        const historyCommand = /^profile\s+history(?:\s|$)/i.test((args ?? "").trim());
        if (historyCommand) {
          await handleCognitiveRoutingProfileCommand(args, profileCommandContext, routingSession.commandController());
          return;
        }
        if (!routingSession.hasController() && !routingSession.armed) {
          routingSession.beginExplicitReactivation();
          await applyLiveCapabilityStateForSession(ctx, { reconcileCognitiveRouting: true });
        }
        const profileController = routingSession.commandController();
        if (await handleCognitiveRoutingProfileCommand(args, profileCommandContext, profileController)) {
          if (profileController) {
            routingSession.beginExplicitReactivation();
            await applyLiveCapabilityStateForSession(ctx, {
              reconcileCognitiveRouting: routingSession.armed !== undefined,
              materializeCognitiveRouting: routingSession.armed !== undefined && !isPiFlowHost(pi?.host),
            });
          }
          return;
        }
      }
      await handleFreeflowCommand(
        args,
        ctx,
        async (_changed, options = {}) => {
          await applyLiveCapabilityStateForSession(ctx, {
            reconcileCognitiveRouting: options.reconcileCognitiveRouting ?? true,
          });
        },
        pi,
        routingSession.commandController(),
      );
    },
  });
}
