import { CognitiveRoutingController } from "./cognitive-routing/controller.js";
import {
  cognitiveRoutingProfileCompletions,
  handleCognitiveRoutingProfileCommand,
} from "./cognitive-routing/commands.js";
import { registerCognitiveRoutingTool } from "./cognitive-routing/tool.js";
import { handleNativeToolSafetyNet } from "./output-router/native-safety-net.js";
import { handleObservedToolRouting } from "./output-router/observed-tool-routing.js";
import { registerRouterTools } from "./output-router/router-tools.js";
import { handleFreeflowCommand, handleOutputRouterCommand } from "./settings/settings-ui.js";
import { isPiFlowHost } from "./runtime/runtime-identity.js";
import {
  CONTRIBUTOR_COMMANDS,
  COGNITIVE_ROUTING_SWITCH_TOOL_NAME,
  WORKFLOW_COMMANDS,
  FREEFLOW_STATUS_TOOL_NAME,
  freeflowModelSkillPaths,
  freeflowSkillPath,
  getRuntimeContext,
  OUTPUT_ROUTER_TOOL_NAMES,
  readCapabilityState,
  readModeState,
  readOutputRouterConfig,
  refreshRuntimeContext,
  restoreModeOverride,
  runtimeContext,
  bootstrapMessage,
  filterBootstrapMessage,
  setModeStatus,
  skillPrompt,
  notifyRouterConfigWarnings,
} from "./runtime/runtime-context.js";

function isOutputRouterToolName(name: string): boolean {
  return OUTPUT_ROUTER_TOOL_NAMES.includes(name);
}

function startupSelectionSuppressesCognitiveRouting(ctx: any): boolean {
  return ctx?.modelStateProvenance?.explicitModel === true || ctx?.modelStateProvenance?.explicitThinking === true;
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

  if (allToolNameSet.has(FREEFLOW_STATUS_TOOL_NAME)) {
    if (state.configured && state.enabled) active.add(FREEFLOW_STATUS_TOOL_NAME);
    else active.delete(FREEFLOW_STATUS_TOOL_NAME);
  }

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

  for (const toolName of OUTPUT_ROUTER_TOOL_NAMES) {
    if (!allToolNameSet.has(toolName)) continue;
    if (state.outputRouter.enabled) active.add(toolName);
    else active.delete(toolName);
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

function capabilityCompletions(prefix: string | undefined) {
  const query = prefix ?? "";
  return [
    { value: "settings", label: "settings", description: "Open repository Output Router settings" },
    { value: "status", label: "status", description: "Show effective Output Router state" },
    { value: "enable", label: "enable", description: "Enable Output Router for this repository" },
    { value: "disable", label: "disable", description: "Disable Output Router for this repository" },
  ].filter((item) => item.value.startsWith(query));
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
  return [
    { value: "settings", label: "settings", description: "Open personal override settings" },
    { value: "status", label: "status", description: "Show effective Freeflow state" },
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
  const applyLiveCapabilityStateForSession = async (
    ctx: any,
    options: { reconcileCognitiveRouting?: boolean } = {},
  ): Promise<void> => {
    cognitiveRoutingController = await applyLiveCapabilityState(pi, ctx, cognitiveRoutingController, options);
  };

  if (isPiFlowHost(pi?.host)) {
    registerCognitiveRoutingTool(pi, () => cognitiveRoutingController);
  }
  registerRouterTools(pi, () => cognitiveRoutingController?.state(), pi?.host);

  if (isPiFlowHost(pi?.host) && typeof pi.registerShortcut === "function") {
    pi.registerShortcut("ctrl+shift+r", {
      description: "Cycle the Cognitive Routing manual standard/reasoning hold",
      handler: async (ctx) => {
        if (typeof ctx?.isIdle === "function" && !ctx.isIdle()) {
          ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
          return;
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
    const [modeState, routerConfigResult, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readOutputRouterConfig(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx, pi?.host),
    ]);
    await refreshRuntimeContext(capabilityState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    cognitiveRoutingController = await reconcileCognitiveRoutingController(
      pi,
      ctx,
      capabilityState,
      cognitiveRoutingController,
    );
    setModeStatus(ctx, modeState, capabilityState, cognitiveRoutingController?.state());
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
    if (controller) await controller.shutdown(event?.reason);
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreModeOverride(ctx);
    const controller = cognitiveRoutingController;
    if (controller) await controller.reconcileBranch();
    await applyLiveCapabilityStateForSession(ctx);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const controller = cognitiveRoutingController;
    if (controller) await controller.reconcileBranch();
    const [modeState, routerConfigResult, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readOutputRouterConfig(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx, pi?.host),
    ]);
    await refreshRuntimeContext(capabilityState);
    setModeStatus(ctx, modeState, capabilityState, cognitiveRoutingController?.state());
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    await applyCapabilityToolVisibility(pi, ctx, capabilityState, cognitiveRoutingController);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const [modeState, routerConfigResult, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readOutputRouterConfig(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx, pi?.host),
    ]);
    const cognitiveRoutingRuntime = cognitiveRoutingController?.state();
    const effectivePromptCapabilityState = promptCapabilityState(capabilityState, cognitiveRoutingRuntime, ctx);
    const freeflowContext = await getRuntimeContext(effectivePromptCapabilityState);
    setModeStatus(ctx, modeState, capabilityState, cognitiveRoutingRuntime);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    await applyCapabilityToolVisibility(pi, ctx, capabilityState, cognitiveRoutingController);
    const freeflowRuntimeContext = runtimeContext(
      modeState,
      freeflowContext,
      routerConfigResult,
      effectivePromptCapabilityState,
      cognitiveRoutingRuntime,
    );
    const bootstrap = bootstrapMessage(freeflowContext, effectivePromptCapabilityState, ctx.sessionManager);
    const systemPrompt = freeflowRuntimeContext
      ? `${event.systemPrompt}\n\n${freeflowRuntimeContext}`
      : event.systemPrompt;
    return { message: bootstrap, systemPrompt };
  });

  pi.on("context", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    const effectivePromptCapabilityState = promptCapabilityState(
      capabilityState,
      cognitiveRoutingController?.state(),
      ctx,
    );
    let changed = false;
    const messages = event.messages
      .map((message) => {
        const filtered = filterBootstrapMessage(message, effectivePromptCapabilityState);
        if (filtered !== message) changed = true;
        return filtered;
      })
      .filter((message) => message !== undefined);
    return changed ? { messages } : undefined;
  });

  pi.on("tool_call", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    if ((!capabilityState.configured || !capabilityState.enabled) && toolName === FREEFLOW_STATUS_TOOL_NAME) {
      return disabledToolCall(toolName, "freeflow");
    }
    if (!capabilityState.outputRouter.enabled && isOutputRouterToolName(toolName)) {
      return disabledToolCall(toolName, "output-router");
    }
    return undefined;
  });

  pi.on("tool_result", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx, pi?.host);
    const toolName = typeof event?.toolName === "string" ? event.toolName : "";
    if (isPiFlowHost(pi?.host) && toolName === COGNITIVE_ROUTING_SWITCH_TOOL_NAME) {
      await applyLiveCapabilityStateForSession(ctx);
    }
    if (!capabilityState.outputRouter.enabled) {
      return undefined;
    }
    const observed = await handleObservedToolRouting(event, ctx);
    if (observed) {
      return observed;
    }
    return handleNativeToolSafetyNet(event, ctx);
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
      if (
        isPiFlowHost(pi?.host) &&
        (await handleCognitiveRoutingProfileCommand(args, ctx, cognitiveRoutingController))
      ) {
        await applyLiveCapabilityStateForSession(ctx);
        return;
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

  pi.registerCommand("output-router", {
    description: "Open Freeflow Output Router settings or print compact status",
    getArgumentCompletions: capabilityCompletions,
    handler: async (args, ctx) => {
      await handleOutputRouterCommand(
        args,
        ctx,
        async () => {
          await applyLiveCapabilityStateForSession(ctx);
        },
        pi,
      );
    },
  });
}
