import {
  COGNITIVE_ROUTING_CONTROL_ENTRY,
  COGNITIVE_ROUTING_INTENT_ENTRY,
  CognitiveRoutingController,
} from "./cognitive-routing/controller.js";
import {
  cognitiveRoutingProfileCompletions,
  handleCognitiveRoutingProfileCommand,
} from "./cognitive-routing/commands.js";
import { registerCognitiveRoutingTool } from "./cognitive-routing/tool.js";
import { handleContextCommand } from "./context-virtualization/commands.js";
import { ContextVirtualizationRuntime } from "./context-virtualization/runtime.js";
import { CONTEXT_VIRTUALIZATION_TOOL_NAME, registerContextVirtualizationTool } from "./context-virtualization/tool.js";
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
  bootstrapMessage,
  filterBootstrapMessage,
  setModeStatus,
  skillPrompt,
  withoutCognitiveRoutingRuntimeState,
  withCognitiveRoutingRuntimeState,
} from "./runtime/runtime-context.js";

function startupSelectionSuppressesCognitiveRouting(ctx: any): boolean {
  return ctx?.modelStateProvenance?.explicitModel === true || ctx?.modelStateProvenance?.explicitThinking === true;
}

type SessionEntriesContext = {
  sessionManager?: {
    getBranch?: () => readonly unknown[];
    getEntries?: () => readonly unknown[];
  };
};

function sessionHasConversationOrRoutingState(ctx: SessionEntriesContext | undefined): boolean {
  try {
    const entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    if (!Array.isArray(entries)) return false;
    return entries.some((entry: unknown) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry as { type?: unknown; customType?: unknown };
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

function promptCapabilityState(capabilityState: any, cognitiveRoutingRuntime: any, ctx: any): any {
  if (
    capabilityState?.cognitiveRouting?.effective !== true ||
    (cognitiveRoutingRuntime?.effective === true && !startupSelectionSuppressesCognitiveRouting(ctx))
  ) {
    return capabilityState;
  }

  return {
    ...capabilityState,
    cognitiveRouting: {
      ...capabilityState.cognitiveRouting,
      effective: false,
      blockingReason: {
        code: "disabled",
        message: "Cognitive Routing is inactive for this Pi runtime",
      },
    },
  };
}

function hasCognitiveRoutingHost(pi: any, ctx: any): boolean {
  return (
    isPiFlowHost(pi?.host) &&
    typeof pi?.appendEntryDurable === "function" &&
    typeof pi?.acquireModelStateControl === "function" &&
    typeof ctx?.modelRegistry?.getApiKeyAndHeaders === "function"
  );
}

async function reconcileCognitiveRoutingController(
  pi: any,
  ctx: any,
  capabilityState: any,
  previous: CognitiveRoutingController | undefined,
): Promise<CognitiveRoutingController | undefined> {
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
  pi: any,
  ctx: any,
  capabilityState = undefined,
  cognitiveRoutingController: CognitiveRoutingController | undefined = undefined,
): Promise<void> {
  if (typeof pi?.setActiveTools !== "function" || typeof pi?.getAllTools !== "function") {
    return;
  }

  const state = capabilityState ?? (await readCapabilityState(ctx.cwd, ctx, pi?.host));
  const allToolNames = pi
    .getAllTools()
    .map((tool: any) => tool?.name)
    .filter(Boolean);
  const allToolNameSet = new Set(allToolNames);
  const currentActive = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : undefined;
  const active = new Set(
    (Array.isArray(currentActive) ? currentActive : allToolNames).filter((name: string) => allToolNameSet.has(name)),
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

  if (allToolNameSet.has(CONTEXT_VIRTUALIZATION_TOOL_NAME)) {
    if (state.contextVirtualization?.effective === true) active.add(CONTEXT_VIRTUALIZATION_TOOL_NAME);
    else active.delete(CONTEXT_VIRTUALIZATION_TOOL_NAME);
  }

  pi.setActiveTools([...active]);
}

async function applyLiveCapabilityState(
  pi: any,
  ctx: any,
  cognitiveRoutingController: CognitiveRoutingController | undefined,
  options: { reconcileCognitiveRouting?: boolean } = {},
): Promise<CognitiveRoutingController | undefined> {
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
  setModeStatus(ctx, modeState, capabilityState, nextController?.state());
  await applyCapabilityToolVisibility(pi, ctx, capabilityState, nextController);
  return nextController;
}

function disabledToolCall(toolName: string, capability: string) {
  const command = capability === "freeflow" ? "/freeflow settings" : `/${capability} settings`;
  return {
    block: true,
    reason: `${toolName} is disabled by Freeflow config. Configure ${capability} with ${command}.`,
  };
}

function freeflowCompletions(prefix: string | undefined, hostInfo = undefined) {
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
  if (query.startsWith("context ")) {
    const contextQuery = query.slice("context ".length);
    return [
      { value: "status", label: "status", description: "Show Context Virtualization state" },
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
    { value: "context", label: "context", description: "Inspect Context Virtualization" },
    { value: "mode", label: "mode", description: "Select a temporary session mode" },
    ...(isPiFlowHost(hostInfo)
      ? [{ value: "profile", label: "profile", description: "Hold or release Cognitive Routing profile control" }]
      : []),
    { value: "enable", label: "enable", description: "Enable Freeflow for this repository" },
    { value: "disable", label: "disable", description: "Disable Freeflow for this repository" },
  ].filter((item) => item.value.startsWith(query));
}

function bypassCompletions(prefix: string | undefined) {
  const query = prefix ?? "";
  return [
    { value: "next", label: "next", description: "Skip one optional step" },
    { value: "task", label: "task", description: "Reduce optional pressure for the current task" },
  ].filter((item) => item.value.startsWith(query));
}

async function sendSkillCommand(pi: any, ctx: any, skill: string, args: string | undefined) {
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
  let cognitiveRoutingController: CognitiveRoutingController | undefined;
  let contextVirtualizationRuntime: ContextVirtualizationRuntime | undefined;
  const applyLiveCapabilityStateForSession = async (
    ctx: any,
    options: { reconcileCognitiveRouting?: boolean } = {},
  ): Promise<void> => {
    cognitiveRoutingController = await applyLiveCapabilityState(pi, ctx, cognitiveRoutingController, options);
  };

  if (isPiFlowHost(pi?.host)) {
    registerCognitiveRoutingTool(pi, () => cognitiveRoutingController);
  }
  registerContextVirtualizationTool(pi, () => contextVirtualizationRuntime);

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
        const result = await controller.setManualProfile(target);
        if (result.status === "active") {
          ctx.ui?.notify?.(`Cognitive Routing manual hold set to ${target}.`, "info");
        } else {
          ctx.ui?.notify?.(`Cognitive Routing could not set the manual profile: ${result.reason}.`, "warning");
        }
        await applyLiveCapabilityStateForSession(ctx);
      },
    });
    pi.registerShortcut("ctrl+shift+a", {
      description: "Release the Cognitive Routing manual hold and return to automatic control",
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
        const result = await controller.setAutomaticControl();
        if (result.status === "automatic") {
          ctx.ui?.notify?.("Cognitive Routing automatic control active.", "info");
        } else {
          ctx.ui?.notify?.(`Cognitive Routing could not return to automatic control: ${result.reason}.`, "warning");
        }
        await applyLiveCapabilityStateForSession(ctx);
      },
    });
  }

  pi.on("resources_discover", async (event, ctx) => {
    const cwd = ctx?.cwd ?? event?.cwd ?? process.cwd();
    const state = await readCapabilityState(cwd, ctx, pi?.host);
    if (!state.configured) {
      return { skillPaths: [freeflowSkillPath("setup-freeflow")] };
    }
    if (!state.enabled || !state.skills.effective) {
      return { skillPaths: [] };
    }
    return { skillPaths: freeflowModelSkillPaths() };
  });

  pi.on("session_start", async (_event, ctx) => {
    restoreModeOverride(ctx);
    contextVirtualizationRuntime = new ContextVirtualizationRuntime(pi, ctx);
    await contextVirtualizationRuntime.recover(ctx);
    const [modeState, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx, pi?.host),
    ]);
    await refreshRuntimeContext(capabilityState);
    const hasSessionState = sessionHasConversationOrRoutingState(ctx);
    const cognitiveRoutingStartupPending =
      capabilityState?.cognitiveRouting?.effective === true &&
      !hasSessionState &&
      !startupSelectionSuppressesCognitiveRouting(ctx);
    cognitiveRoutingController = hasSessionState
      ? await reconcileCognitiveRoutingController(pi, ctx, capabilityState, cognitiveRoutingController)
      : undefined;
    setModeStatus(ctx, modeState, capabilityState, cognitiveRoutingController?.state(), {
      cognitiveRoutingStartupPending,
    });
    await applyCapabilityToolVisibility(pi, ctx, capabilityState, cognitiveRoutingController);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (!cognitiveRoutingController) return undefined;
    await applyLiveCapabilityStateForSession(ctx);
    return undefined;
  });

  pi.on("session_shutdown", async (event) => {
    const controller = cognitiveRoutingController;
    cognitiveRoutingController = undefined;
    contextVirtualizationRuntime = undefined;
    if (controller) await controller.shutdown(event?.reason);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreModeOverride(ctx);
    const controller = cognitiveRoutingController;
    if (controller) await controller.reconcileBranch();
    if (contextVirtualizationRuntime) {
      contextVirtualizationRuntime.setContext(ctx);
      await contextVirtualizationRuntime.recover(ctx);
    }
    await applyLiveCapabilityStateForSession(ctx);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const controller = cognitiveRoutingController;
    if (controller) await controller.reconcileBranch();
    if (contextVirtualizationRuntime) {
      contextVirtualizationRuntime.setContext(ctx);
      await contextVirtualizationRuntime.recover(ctx);
    }
    const [modeState, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx, pi?.host),
    ]);
    await refreshRuntimeContext(capabilityState);
    setModeStatus(ctx, modeState, capabilityState, cognitiveRoutingController?.state());
    await applyCapabilityToolVisibility(pi, ctx, capabilityState, cognitiveRoutingController);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const [modeState, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx, pi?.host),
    ]);
    if (!cognitiveRoutingController) {
      cognitiveRoutingController = await reconcileCognitiveRoutingController(
        pi,
        ctx,
        capabilityState,
        cognitiveRoutingController,
      );
    }
    const cognitiveRoutingRuntime = cognitiveRoutingController?.state();
    const effectivePromptCapabilityState = promptCapabilityState(capabilityState, cognitiveRoutingRuntime, ctx);
    const freeflowContext = await getRuntimeContext(effectivePromptCapabilityState);
    setModeStatus(ctx, modeState, capabilityState, cognitiveRoutingRuntime);
    await applyCapabilityToolVisibility(pi, ctx, capabilityState, cognitiveRoutingController);
    const freeflowRuntimeContext = runtimeContext(modeState, freeflowContext, effectivePromptCapabilityState);
    const bootstrap = bootstrapMessage(freeflowContext, effectivePromptCapabilityState, ctx.sessionManager);
    const systemPrompt = freeflowRuntimeContext
      ? `${event.systemPrompt}\n\n${freeflowRuntimeContext}`
      : event.systemPrompt;
    return { message: bootstrap, systemPrompt };
  });

  pi.on("context", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    const cognitiveRoutingRuntime = cognitiveRoutingController?.state();
    const effectivePromptCapabilityState = promptCapabilityState(capabilityState, cognitiveRoutingRuntime, ctx);
    let changed = false;
    let messages = event.messages
      .map((message) => {
        const filtered = filterBootstrapMessage(message, effectivePromptCapabilityState);
        if (filtered !== message) changed = true;
        return filtered;
      })
      .filter((message) => message !== undefined);
    if (contextVirtualizationRuntime) {
      contextVirtualizationRuntime.setContext(ctx);
      const projected = await contextVirtualizationRuntime.project(
        messages,
        effectivePromptCapabilityState.contextVirtualization?.effective === true,
      );
      if (projected.changed) {
        changed = true;
        messages = projected.messages;
      }
    }
    const cognitiveRoutingContextEnabled =
      capabilityState.cognitiveRouting?.effective === true && !startupSelectionSuppressesCognitiveRouting(ctx);
    const nextMessages = cognitiveRoutingContextEnabled
      ? withCognitiveRoutingRuntimeState(messages, cognitiveRoutingRuntime)
      : withoutCognitiveRoutingRuntimeState(messages);
    if (nextMessages.length !== messages.length || cognitiveRoutingContextEnabled) {
      changed = true;
    }
    messages = nextMessages;
    return changed ? { messages } : undefined;
  });

  pi.on("tool_call", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    if (capabilityState.contextVirtualization?.effective !== true && toolName === CONTEXT_VIRTUALIZATION_TOOL_NAME) {
      return disabledToolCall(toolName, "context-virtualization");
    }
    return undefined;
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
      if (contextInput === "context" || contextInput.startsWith("context ")) {
        const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
        await handleContextCommand(
          contextInput.slice("context".length).trim(),
          ctx,
          contextVirtualizationRuntime,
          capabilityState.contextVirtualization?.effective === true,
        );
        return;
      }
      if (isPiFlowHost(pi?.host) && /^profile(?:\s|$)/i.test((args ?? "").trim())) {
        if (!cognitiveRoutingController) {
          await applyLiveCapabilityStateForSession(ctx, { reconcileCognitiveRouting: true });
        }
        if (await handleCognitiveRoutingProfileCommand(args, ctx, cognitiveRoutingController)) {
          await applyLiveCapabilityStateForSession(ctx);
          return;
        }
      }
      await handleFreeflowCommand(
        args,
        ctx,
        async () => {
          await applyLiveCapabilityStateForSession(ctx, { reconcileCognitiveRouting: true });
        },
        pi,
        cognitiveRoutingController,
      );
    },
  });
}
