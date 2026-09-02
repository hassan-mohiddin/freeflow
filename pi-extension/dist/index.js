import {
  COGNITIVE_ROUTING_CONTROL_ENTRY,
  COGNITIVE_ROUTING_INTENT_ENTRY,
  CognitiveRoutingController,
} from "./cognitive-routing/controller.js";
import {
  cognitiveRoutingProfileCompletions,
  handleCognitiveRoutingProfileCommand,
} from "./cognitive-routing/commands.js";
import { registerCognitiveRoutingHistoryTool, registerCognitiveRoutingTool } from "./cognitive-routing/tool.js";
import { readCognitiveRoutingHistory } from "./cognitive-routing/history.js";
import { createContextControlExtension } from "./context-control/adapters/extension.js";
import {
  CONTEXT_CONTROL_DECIDE_TOOL_NAME,
  CONTEXT_CONTROL_TOOL_NAME,
  CONTEXT_CONTROL_USE_EVIDENCE_TOOL_NAME,
} from "./context-control/interfaces/tool.js";
import { handleFreeflowCommand } from "./settings/settings-ui.js";
import { isPiFlowHost } from "./runtime/runtime-identity.js";
import {
  CONTRIBUTOR_COMMANDS,
  COGNITIVE_ROUTING_SWITCH_TOOL_NAME,
  WORKFLOW_COMMANDS,
  freeflowModelSkillPaths,
  freeflowSkillPath,
  getRuntimeContext,
  readCapabilityState,
  readModeState,
  refreshRuntimeContext,
  restoreModeOverride,
  runtimeContext,
  filterBootstrapMessage,
  setModeStatus,
  skillPrompt,
  withFreeflowRuntimeState,
} from "./runtime/runtime-context.js";
function startupSelectionSuppressesCognitiveRouting(ctx) {
  return ctx?.modelStateProvenance?.explicitModel === true || ctx?.modelStateProvenance?.explicitThinking === true;
}
function unavailableCapability(capability, code, message) {
  return {
    ...capability,
    effective: false,
    blockingReason: { code, message },
  };
}
function modelFacingCapabilityState(
  capabilityState,
  ctx,
  freeflowContext,
  cognitiveRoutingController,
  cognitiveRoutingActivationFailed = false,
) {
  const surfaceState = {
    ...capabilityState,
    interactionContract: { ...capabilityState?.interactionContract },
    skills: { ...capabilityState?.skills },
    cognitiveRouting: { ...capabilityState?.cognitiveRouting },
    contextControl: { ...capabilityState?.contextControl },
  };
  if (surfaceState.enabled !== true) return surfaceState;
  const markUnavailable = (key, message) => {
    if (surfaceState[key]?.effective === true) {
      surfaceState[key] = unavailableCapability(surfaceState[key], "unavailable", message);
    }
  };
  if (!freeflowContext?.corePrompt) {
    for (const key of ["interactionContract", "skills", "contextControl", "cognitiveRouting"]) {
      markUnavailable(key, "Freeflow core prompt is unavailable.");
    }
    return surfaceState;
  }
  if (surfaceState.interactionContract?.effective === true && !freeflowContext.interactionContractPrompt) {
    markUnavailable("interactionContract", "Interaction Contract prompt is unavailable.");
  }
  if (surfaceState.skills?.effective === true && !freeflowContext.skillsPrompt) {
    markUnavailable("skills", "Skills prompt is unavailable.");
  }
  if (surfaceState.skills?.effective === true) {
    if (surfaceState.contextControl?.effective === true && !freeflowContext.contextControlPrompt) {
      markUnavailable("contextControl", "Context Control prompt is unavailable.");
    }
  } else {
    for (const key of ["contextControl", "cognitiveRouting"]) {
      markUnavailable(key, "Skills prompt is unavailable.");
    }
  }
  if (surfaceState.cognitiveRouting?.effective === true) {
    if (startupSelectionSuppressesCognitiveRouting(ctx)) {
      surfaceState.cognitiveRouting = unavailableCapability(
        surfaceState.cognitiveRouting,
        "runtime_inactive",
        "Cognitive Routing is inactive because the host selected the startup model or thinking level.",
      );
    } else if (cognitiveRoutingActivationFailed || cognitiveRoutingController?.state()?.effective === false) {
      surfaceState.cognitiveRouting = unavailableCapability(
        surfaceState.cognitiveRouting,
        "unavailable",
        "Cognitive Routing could not activate for this session.",
      );
    } else if (!freeflowContext.cognitiveRoutingPrompt) {
      markUnavailable("cognitiveRouting", "Cognitive Routing prompt is unavailable.");
    }
  }
  return surfaceState;
}
function modelFacingModeState(modeState, capabilityState) {
  if (capabilityState?.skills?.effective === true) return modeState;
  return { ...modeState, active: false, effectiveMode: null };
}
function sessionHasConversationOrRoutingState(ctx) {
  try {
    const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    if (!Array.isArray(entries)) return false;
    return entries.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry;
      if (
        typeof record.type === "string" &&
        ["message", "custom_message", "compaction", "branch_summary"].includes(record.type)
      ) {
        return true;
      }
      return (
        record.type === "custom" &&
        (record.customType === COGNITIVE_ROUTING_INTENT_ENTRY || record.customType === COGNITIVE_ROUTING_CONTROL_ENTRY)
      );
    });
  } catch {
    return false;
  }
}
function hasCognitiveRoutingHost(pi, ctx) {
  return (
    isPiFlowHost(pi?.host) &&
    typeof pi?.appendEntryDurable === "function" &&
    typeof pi?.acquireModelStateControl === "function" &&
    typeof ctx?.modelRegistry?.getApiKeyAndHeaders === "function"
  );
}
async function reconcileCognitiveRoutingController(pi, ctx, capabilityState, previous) {
  const cognitiveRouting = capabilityState?.cognitiveRouting;
  if (
    !isPiFlowHost(pi?.host) ||
    !cognitiveRouting?.effective ||
    startupSelectionSuppressesCognitiveRouting(ctx) ||
    !hasCognitiveRoutingHost(pi, ctx)
  ) {
    if (previous) await previous.deactivate();
    return undefined;
  }
  const controller = new CognitiveRoutingController({ capabilityState: cognitiveRouting, pi, ctx });
  const recovered = await controller.recover();
  if (recovered.status === "pending") return controller;
  if (recovered.status !== "active") {
    const activated = await controller.activate();
    return activated.status === "active" ? controller : undefined;
  }
  return controller;
}
async function applyCapabilityToolVisibility(
  pi,
  ctx,
  capabilityState = undefined,
  cognitiveRoutingController = undefined,
) {
  if (typeof pi?.setActiveTools !== "function" || typeof pi?.getAllTools !== "function") {
    return;
  }
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
    const controllerState = cognitiveRoutingController?.state();
    const routingToolActive =
      state.cognitiveRouting?.effective === true &&
      controllerState?.effective === true &&
      controllerState.controlMode === "automatic" &&
      !startupSelectionSuppressesCognitiveRouting(ctx);
    if (routingToolActive) active.add(COGNITIVE_ROUTING_SWITCH_TOOL_NAME);
    else active.delete(COGNITIVE_ROUTING_SWITCH_TOOL_NAME);
  }
  const contextControlActive = state.contextControl?.effective === true;
  if (allToolNameSet.has(CONTEXT_CONTROL_TOOL_NAME)) {
    if (contextControlActive) active.add(CONTEXT_CONTROL_TOOL_NAME);
    else active.delete(CONTEXT_CONTROL_TOOL_NAME);
  }
  if (allToolNameSet.has(CONTEXT_CONTROL_DECIDE_TOOL_NAME)) {
    const proposalEnabled =
      state.contextControl?.cleanupMode === "model-approval" || state.contextControl?.recoveryMode === "model-approval";
    if (contextControlActive && proposalEnabled) active.add(CONTEXT_CONTROL_DECIDE_TOOL_NAME);
    else active.delete(CONTEXT_CONTROL_DECIDE_TOOL_NAME);
  }
  if (allToolNameSet.has(CONTEXT_CONTROL_USE_EVIDENCE_TOOL_NAME)) {
    if (contextControlActive) active.add(CONTEXT_CONTROL_USE_EVIDENCE_TOOL_NAME);
    else active.delete(CONTEXT_CONTROL_USE_EVIDENCE_TOOL_NAME);
  }
  pi.setActiveTools([...active]);
}
async function applyLiveCapabilityState(pi, ctx, cognitiveRoutingController, options = {}) {
  const [modeState, capabilityState] = await Promise.all([
    readModeState(ctx.cwd),
    readCapabilityState(ctx.cwd, ctx, pi?.host),
  ]);
  await refreshRuntimeContext(capabilityState);
  let nextController = cognitiveRoutingController;
  if (
    options.reconcileCognitiveRouting &&
    (nextController === undefined || capabilityState.cognitiveRouting?.effective !== true)
  ) {
    nextController = await reconcileCognitiveRoutingController(pi, ctx, capabilityState, nextController);
  }
  const surfaceCapabilityState = modelFacingCapabilityState(
    capabilityState,
    ctx,
    await getRuntimeContext(capabilityState),
    nextController,
  );
  setModeStatus(ctx, modeState, surfaceCapabilityState, nextController?.state());
  await applyCapabilityToolVisibility(pi, ctx, surfaceCapabilityState, nextController);
  return nextController;
}
function contextControlAdminMessage(operation, result) {
  if (result?.status === "unavailable" || result?.status === "rejected") {
    return `Context Control ${operation}: ${result.status} · ${result.reason ?? "unavailable"}`;
  }
  if (operation === "status") {
    const reduced =
      result?.residency && typeof result.residency === "object"
        ? Object.values(result.residency).filter((state) => state !== "full").length
        : 0;
    return [
      "Context Control status",
      `state=${result?.state ?? "unknown"}`,
      `sources=${result?.catalogSourceCount ?? 0}`,
      `reduced=${reduced}`,
      `protected=${Array.isArray(result?.protectedRefs) ? result.protectedRefs.length : 0}`,
      `leases=${result?.activeEvidenceHandleCount ?? 0}`,
      `pending=${result?.pendingProposal === true ? "yes" : "no"}`,
    ].join(" · ");
  }
  if (operation === "list") {
    const sources = Array.isArray(result?.sources) ? result.sources : [];
    const refs = sources
      .slice(0, 32)
      .map((source) => source?.ref)
      .filter((ref) => typeof ref === "string" && ref.length > 0);
    const suffix = refs.length > 0 ? ` · ${refs.join(", ")}${sources.length > refs.length ? ", …" : ""}` : "";
    return `Context Control list · sources=${sources.length} · protected=${result?.protectedCount ?? 0} · excluded=${result?.excludedCount ?? 0}${suffix}`;
  }
  const changed = Array.isArray(result?.changed) ? result.changed.length : 0;
  return `Context Control ${operation}: ${result?.status ?? "ok"}${changed > 0 ? ` · changed=${changed}` : ""}`;
}
function freeflowCompletions(prefix, hostInfo = undefined) {
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
  if (isPiFlowHost(hostInfo) && query.startsWith("profile ")) {
    return cognitiveRoutingProfileCompletions(query.slice("profile ".length)).map((item) => ({
      ...item,
      value: `profile ${item.value}`,
    }));
  }
  if (query.startsWith("mode ")) {
    const modeQuery = query.slice("mode ".length);
    return [
      { value: "conversation", label: "conversation", description: "Read-only discussion and inspection" },
      { value: "workflow", label: "workflow", description: "Adaptive workflow for consequential work" },
      { value: "strict-workflow", label: "strict-workflow", description: "Stronger pressure at high-risk boundaries" },
      {
        value: "reset",
        label: "reset",
        description: "Clear the session override and use the configured default",
      },
    ]
      .filter((item) => item.value.startsWith(modeQuery))
      .map((item) => ({ ...item, value: `mode ${item.value}` }));
  }
  if (query.startsWith("context-control ")) {
    const contextControlQuery = query.slice("context-control ".length);
    return [
      { value: "status", label: "status", description: "Show Context Control state" },
      { value: "list", label: "list", description: "List Context Control sources" },
      { value: "restore", label: "restore", description: "Restore Context Control references" },
      { value: "reset all", label: "reset all", description: "Reset Context Control state" },
      { value: "purge", label: "purge", description: "Delete Context Control sidecar metadata" },
    ]
      .filter((item) => item.value.startsWith(contextControlQuery))
      .map((item) => ({ ...item, value: `context-control ${item.value}` }));
  }
  return [
    { value: "settings", label: "settings", description: "Open personal override settings" },
    { value: "status", label: "status", description: "Show effective Freeflow state" },
    { value: "context-control", label: "context-control", description: "Manage Context Control sidecar metadata" },
    { value: "mode", label: "mode", description: "Select a temporary session mode" },
    ...(isPiFlowHost(hostInfo)
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
    await pi.sendUserMessage(skillPrompt(skill, args));
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
  if (!state.skills.effective) {
    ctx.ui.notify("Freeflow skills are disabled. Use /freeflow settings to enable skills.", "warning");
    return;
  }
  await pi.sendUserMessage(skillPrompt(skill, args));
}
export default function freeflow(pi) {
  let cognitiveRoutingController;
  let latestCognitiveRoutingContext;
  let providerSurfaceSnapshot;
  const contextControlExtensionState = createContextControlExtension(pi, {
    registerLifecycle: false,
    resolveConfig: async (ctx) => {
      const state = await readCapabilityState(ctx?.cwd ?? process.cwd(), ctx, pi?.host);
      return {
        enabled: state.contextControl?.effective === true,
        cleanupMode:
          state.contextControl?.cleanupMode === "automatic" || state.contextControl?.cleanupMode === "model-approval"
            ? state.contextControl.cleanupMode
            : "model-only",
        recoveryMode:
          state.contextControl?.recoveryMode === "automatic" || state.contextControl?.recoveryMode === "model-approval"
            ? state.contextControl.recoveryMode
            : "model-only",
        recoveryScope:
          state.contextControl?.recoveryScope === "current-project" ||
          state.contextControl?.recoveryScope === "current-session"
            ? state.contextControl.recoveryScope
            : "active-branch",
      };
    },
  });
  const buildProviderSurface = async (ctx, activateCognitiveRouting = false) => {
    const [modeState, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx, pi?.host),
    ]);
    const freeflowContext = await getRuntimeContext(capabilityState);
    const promptCapabilityState = modelFacingCapabilityState(
      capabilityState,
      ctx,
      freeflowContext,
      cognitiveRoutingController,
    );
    let activationAttempted = false;
    if (
      activateCognitiveRouting &&
      (cognitiveRoutingController === undefined || promptCapabilityState.cognitiveRouting?.effective !== true)
    ) {
      activationAttempted =
        promptCapabilityState.cognitiveRouting?.effective === true && !startupSelectionSuppressesCognitiveRouting(ctx);
      try {
        cognitiveRoutingController = await reconcileCognitiveRoutingController(
          pi,
          ctx,
          promptCapabilityState,
          cognitiveRoutingController,
        );
      } catch {
        cognitiveRoutingController = undefined;
      }
    }
    const surfaceCapabilityState = modelFacingCapabilityState(
      promptCapabilityState,
      ctx,
      freeflowContext,
      cognitiveRoutingController,
      activationAttempted && !cognitiveRoutingController,
    );
    return {
      modeState: modelFacingModeState(modeState, surfaceCapabilityState),
      capabilityState: surfaceCapabilityState,
      freeflowContext,
      cognitiveRoutingRuntime: cognitiveRoutingController?.state(),
      configuredCapabilityState: capabilityState,
    };
  };
  const applyLiveCapabilityStateForSession = async (ctx, options = {}) => {
    cognitiveRoutingController = await applyLiveCapabilityState(pi, ctx, cognitiveRoutingController, options);
  };
  if (isPiFlowHost(pi?.host)) {
    registerCognitiveRoutingTool(pi, () => cognitiveRoutingController);
    registerCognitiveRoutingHistoryTool(pi, (options, context) => {
      if (cognitiveRoutingController) return cognitiveRoutingController.history(options);
      return readCognitiveRoutingHistory(context ?? latestCognitiveRoutingContext, options);
    });
  }
  if (isPiFlowHost(pi?.host) && typeof pi.registerShortcut === "function") {
    pi.registerShortcut("ctrl+shift+r", {
      description: "Cycle the Cognitive Routing manual standard/reasoning hold",
      handler: async (ctx) => {
        if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) {
          ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
          return;
        }
        if (!cognitiveRoutingController) {
          await applyLiveCapabilityStateForSession(ctx, { reconcileCognitiveRouting: true });
        }
        const controller = cognitiveRoutingController;
        if (!controller) {
          ctx.ui?.notify?.("Cognitive Routing is unavailable for this session.", "warning");
          return;
        }
        const current = controller.state().activeProfile;
        const target = current === "reasoning" ? "standard" : "reasoning";
        const result = await controller.setManualProfile(target, "profile-shortcut");
        if (result.status === "active") {
          ctx.ui?.notify?.(`Cognitive Routing manual hold set to ${target}.`, "info");
        } else {
          ctx.ui?.notify?.(`Cognitive Routing could not set the manual profile: ${result.reason}.`, "warning");
        }
        await applyLiveCapabilityStateForSession(ctx);
      },
    });
    pi.registerShortcut("ctrl+shift+a", {
      description: "Cycle the Cognitive Routing automatic standard/reasoning profile",
      handler: async (ctx) => {
        if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) {
          ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
          return;
        }
        if (!cognitiveRoutingController) {
          await applyLiveCapabilityStateForSession(ctx, { reconcileCognitiveRouting: true });
        }
        const controller = cognitiveRoutingController;
        if (!controller) {
          ctx.ui?.notify?.("Cognitive Routing is unavailable for this session.", "warning");
          return;
        }
        const state = controller.state();
        const target = state.activeProfile === "reasoning" ? "standard" : "reasoning";
        const result =
          state.controlMode === "automatic" && state.activeProfile
            ? await controller.switchAutomaticProfile(
                target,
                `Cycle automatic profile to ${target}.`,
                "user",
                "profile-shortcut",
              )
            : await controller.setAutomaticControl("profile-shortcut");
        if (result.status === "automatic") {
          ctx.ui?.notify?.("Cognitive Routing automatic control active.", "info");
        } else if (result.status === "active") {
          ctx.ui?.notify?.(`Cognitive Routing automatic profile set to ${result.profile}.`, "info");
        } else {
          ctx.ui?.notify?.(`Cognitive Routing could not cycle the automatic profile: ${result.reason}.`, "warning");
        }
        await applyLiveCapabilityStateForSession(ctx);
      },
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
    if (!state.enabled || !state.skills.effective) {
      return { skillPaths: [] };
    }
    return { skillPaths: freeflowModelSkillPaths(state) };
  });
  pi.on("session_start", async (_event, ctx) => {
    latestCognitiveRoutingContext = ctx;
    providerSurfaceSnapshot = undefined;
    restoreModeOverride(ctx);
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    await contextControlExtensionState.start(ctx);
    await refreshRuntimeContext(capabilityState);
    const hasSessionState = sessionHasConversationOrRoutingState(ctx);
    const snapshot = await buildProviderSurface(ctx, hasSessionState);
    const cognitiveRoutingStartupPending =
      snapshot.capabilityState?.cognitiveRouting?.effective === true &&
      !hasSessionState &&
      !startupSelectionSuppressesCognitiveRouting(ctx);
    setModeStatus(ctx, snapshot.modeState, snapshot.capabilityState, snapshot.cognitiveRoutingRuntime, {
      cognitiveRoutingStartupPending,
    });
    await applyCapabilityToolVisibility(pi, ctx, snapshot.capabilityState, cognitiveRoutingController);
  });
  pi.on("agent_settled", async (_event, ctx) => {
    contextControlExtensionState.settled();
    if (!cognitiveRoutingController) return undefined;
    await applyLiveCapabilityStateForSession(ctx);
    return undefined;
  });
  pi.on("session_shutdown", async (event) => {
    providerSurfaceSnapshot = undefined;
    const controller = cognitiveRoutingController;
    cognitiveRoutingController = undefined;
    await contextControlExtensionState.shutdown(typeof event?.reason === "string" ? event.reason : "unknown");
    if (controller) await controller.shutdown(event?.reason);
  });
  for (const eventName of [
    "session_before_switch",
    "session_before_fork",
    "session_before_compact",
    "session_before_tree",
  ]) {
    pi.on(eventName, async () => {
      contextControlExtensionState.invalidate();
    });
  }
  pi.on("session_tree", async (_event, ctx) => {
    latestCognitiveRoutingContext = ctx;
    providerSurfaceSnapshot = undefined;
    restoreModeOverride(ctx);
    contextControlExtensionState.invalidate();
    const controller = cognitiveRoutingController;
    if (controller) await controller.reconcileBranch();
    await applyLiveCapabilityStateForSession(ctx);
  });
  pi.on("session_compact", async (_event, ctx) => {
    latestCognitiveRoutingContext = ctx;
    providerSurfaceSnapshot = undefined;
    contextControlExtensionState.invalidate();
    const controller = cognitiveRoutingController;
    if (controller) await controller.reconcileBranch("session-compact");
    await applyLiveCapabilityStateForSession(ctx);
  });
  pi.on("before_agent_start", async (event, ctx) => {
    latestCognitiveRoutingContext = ctx;
    contextControlExtensionState.setPrompt(event?.prompt);
    const snapshot = await buildProviderSurface(ctx, true);
    providerSurfaceSnapshot = { context: ctx, value: snapshot };
    setModeStatus(ctx, snapshot.modeState, snapshot.capabilityState, snapshot.cognitiveRoutingRuntime);
    await applyCapabilityToolVisibility(pi, ctx, snapshot.capabilityState, cognitiveRoutingController);
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
    const surfaceModeState = snapshot.modeState;
    let changed = false;
    let messages = event.messages
      .map((message) => {
        const filtered = filterBootstrapMessage(message);
        if (filtered !== message) changed = true;
        return filtered;
      })
      .filter((message) => message !== undefined);
    if (surfaceCapabilityState.contextControl?.effective === true) {
      const projected = await contextControlExtensionState.project(messages, ctx);
      if (projected?.changed) {
        changed = true;
        messages = projected.messages;
      }
    }
    const nextMessages = withFreeflowRuntimeState(
      messages,
      surfaceModeState,
      surfaceCapabilityState,
      cognitiveRoutingRuntime,
    );
    changed = true;
    messages = nextMessages;
    return changed ? { messages } : undefined;
  });
  pi.on("before_provider_request", async () => {
    contextControlExtensionState.beforeProviderRequest();
  });
  pi.on("turn_end", async () => {
    contextControlExtensionState.turnEnd();
  });
  pi.on("message_end", async (event) => {
    return contextControlExtensionState.messageEnd(event?.message);
  });
  pi.on("tool_result", async (event, ctx) => {
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    if (isPiFlowHost(pi?.host) && toolName === COGNITIVE_ROUTING_SWITCH_TOOL_NAME) {
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
    getArgumentCompletions: (prefix) => freeflowCompletions(prefix, pi?.host),
    handler: async (args, ctx) => {
      const contextInput = (args ?? "").trim();
      if (/^context-control(?:\s|$)/iu.test(contextInput)) {
        const contextControlArguments = contextInput
          .slice("context-control".length)
          .trim()
          .split(/\s+/u)
          .filter(Boolean);
        const [rawOperation = "", ...argumentsList] = contextControlArguments;
        const operation = rawOperation.toLocaleLowerCase();
        if (operation === "status" && argumentsList.length === 0) {
          const status = contextControlExtensionState.status();
          ctx.ui.notify(
            contextControlAdminMessage("status", status),
            "state" in status && status.state === "ready" ? "info" : "warning",
          );
          return { changed: false, reloaded: false };
        }
        if (operation === "list" && argumentsList.length === 0) {
          const list = contextControlExtensionState.list();
          ctx.ui.notify(contextControlAdminMessage("list", list), list.status === "ok" ? "info" : "warning");
          return { changed: false, reloaded: false };
        }
        if (operation === "restore") {
          if (argumentsList.length === 0) {
            ctx.ui.notify("Usage: /freeflow context-control restore <ctx refs>", "warning");
            return { changed: false, reloaded: false, error: "invalid_context_control_command" };
          }
          if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) {
            ctx.ui.notify("Context Control restore is available only while Pi is idle.", "warning");
            return { changed: false, reloaded: false, error: "busy" };
          }
          const restored = await contextControlExtensionState.restore(argumentsList);
          ctx.ui.notify(contextControlAdminMessage("restore", restored), restored.status === "ok" ? "info" : "warning");
          return {
            changed: restored.status === "ok" && Array.isArray(restored.changed) && restored.changed.length > 0,
            reloaded: false,
          };
        }
        if (operation === "reset" && argumentsList.length === 1 && argumentsList[0] === "all") {
          if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) {
            ctx.ui.notify("Context Control reset is available only while Pi is idle.", "warning");
            return { changed: false, reloaded: false, error: "busy" };
          }
          const reset = await contextControlExtensionState.reset();
          ctx.ui.notify(contextControlAdminMessage("reset", reset), reset.status === "ok" ? "info" : "warning");
          return { changed: reset.status === "ok", reloaded: false };
        }
        if (operation === "purge" && argumentsList.length === 0) {
          if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) {
            ctx.ui.notify("Context Control sidecar purge is available only while Pi is idle.", "warning");
            return { changed: false, reloaded: false, error: "busy" };
          }
          const purged = await contextControlExtensionState.purge(ctx);
          if (purged.status === "ok") {
            ctx.ui.notify("Context Control sidecar metadata purged; canonical session history was unchanged.", "info");
          } else {
            ctx.ui.notify(`Context Control sidecar purge failed: ${purged.reason ?? "unavailable"}.`, "warning");
          }
          await applyLiveCapabilityStateForSession(ctx);
          return { changed: purged.status === "ok", reloaded: false };
        }
        ctx.ui.notify(
          "Usage: /freeflow context-control status, list, restore <ctx refs>, reset all, or purge",
          "warning",
        );
        return { changed: false, reloaded: false, error: "invalid_context_control_command" };
      }
      if (isPiFlowHost(pi?.host) && /^profile(?:\s|$)/i.test((args ?? "").trim())) {
        const profileCommandContext = {
          isIdle: ctx?.isIdle,
          ui: ctx?.ui,
          history: (options) =>
            cognitiveRoutingController?.history(options) ?? readCognitiveRoutingHistory(ctx, options),
        };
        const historyCommand = /^profile\s+history(?:\s|$)/i.test((args ?? "").trim());
        if (historyCommand) {
          await handleCognitiveRoutingProfileCommand(args, profileCommandContext, cognitiveRoutingController);
          return;
        }
        if (!cognitiveRoutingController) {
          await applyLiveCapabilityStateForSession(ctx, { reconcileCognitiveRouting: true });
        }
        if (await handleCognitiveRoutingProfileCommand(args, profileCommandContext, cognitiveRoutingController)) {
          await applyLiveCapabilityStateForSession(ctx);
          return;
        }
      }
      await handleFreeflowCommand(
        args,
        ctx,
        async (_changed, options = {}) => {
          await contextControlExtensionState.reload(ctx);
          await applyLiveCapabilityStateForSession(ctx, {
            reconcileCognitiveRouting: options.reconcileCognitiveRouting ?? true,
          });
        },
        pi,
        cognitiveRoutingController,
      );
    },
  });
}
