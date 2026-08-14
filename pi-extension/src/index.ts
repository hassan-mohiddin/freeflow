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
import {
  CONTRIBUTOR_COMMANDS,
  COGNITIVE_ROUTING_SWITCH_TOOL_NAME,
  WORKFLOW_COMMANDS,
  WORKFLOW_BOOTSTRAP_MESSAGE_TYPE,
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
  workflowBootstrapMessage,
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

function hasCognitiveRoutingHost(pi: any, ctx: any): boolean {
  return (
    typeof pi?.appendEntryDurable === "function" &&
    typeof pi?.acquireModelStateControl === "function" &&
    typeof ctx?.modelRegistry?.getApiKeyAndHeaders === "function"
  );
}

let cognitiveRoutingController: CognitiveRoutingController | undefined;

async function reconcileCognitiveRoutingController(pi: any, ctx: any, capabilityState: any): Promise<void> {
  const cognitiveRouting = capabilityState?.cognitiveRouting;
  if (
    !cognitiveRouting?.effective ||
    startupSelectionSuppressesCognitiveRouting(ctx) ||
    !hasCognitiveRoutingHost(pi, ctx)
  ) {
    const previous = cognitiveRoutingController;
    cognitiveRoutingController = undefined;
    if (previous) await previous.deactivate();
    return;
  }

  const controller = new CognitiveRoutingController({ capabilityState: cognitiveRouting, pi, ctx });
  const recovered = await controller.recover();
  if (recovered.status === "pending") {
    cognitiveRoutingController = controller;
    return;
  }
  if (recovered.status !== "active") {
    const activated = await controller.activate();
    cognitiveRoutingController = activated.status === "active" ? controller : undefined;
    return;
  }
  cognitiveRoutingController = controller;
}

async function applyCapabilityToolVisibility(pi: any, ctx: any, capabilityState = undefined): Promise<void> {
  if (typeof pi?.setActiveTools !== "function" || typeof pi?.getAllTools !== "function") {
    return;
  }

  const state = capabilityState ?? (await readCapabilityState(ctx.cwd, ctx));
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

async function applyLiveCapabilityState(pi: any, ctx: any): Promise<void> {
  const [modeState, capabilityState] = await Promise.all([readModeState(ctx.cwd), readCapabilityState(ctx.cwd, ctx)]);
  await refreshRuntimeContext(capabilityState);
  setModeStatus(ctx, modeState, capabilityState);
  await applyCapabilityToolVisibility(pi, ctx, capabilityState);
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

function freeflowCompletions(prefix: string | undefined) {
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
  if (query.startsWith("profile ")) {
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
    { value: "profile", label: "profile", description: "Hold or release Cognitive Routing profile control" },
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
  const state = await readCapabilityState(ctx.cwd, ctx);
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
  registerRouterTools(pi, () => cognitiveRoutingController?.state());
  registerCognitiveRoutingTool(pi, () => cognitiveRoutingController);

  pi.on("resources_discover", async (event, ctx) => {
    const cwd = ctx?.cwd ?? event?.cwd ?? process.cwd();
    const state = await readCapabilityState(cwd, ctx);
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
      readCapabilityState(ctx.cwd, ctx),
    ]);
    await refreshRuntimeContext(capabilityState);
    setModeStatus(ctx, modeState, capabilityState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    await reconcileCognitiveRoutingController(pi, ctx, capabilityState);
    await applyCapabilityToolVisibility(pi, ctx, capabilityState);
  });

  pi.on("agent_settled", async (_event, ctx) => {
    const controller = cognitiveRoutingController;
    if (!controller) return undefined;
    const state = controller.state();
    if (!state.effective || state.controlMode !== "automatic" || state.activeProfile !== "reasoning") {
      return undefined;
    }
    const result = await controller.switchAutomaticProfile("standard", "Automatic settled-run reset", "system");
    await applyCapabilityToolVisibility(pi, ctx);
    return result;
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
    await applyLiveCapabilityState(pi, ctx);
  });

  pi.on("session_compact", async (_event, ctx) => {
    const controller = cognitiveRoutingController;
    if (controller) await controller.reconcileBranch();
    const [modeState, routerConfigResult, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readOutputRouterConfig(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx),
    ]);
    await refreshRuntimeContext(capabilityState);
    setModeStatus(ctx, modeState, capabilityState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    await applyCapabilityToolVisibility(pi, ctx, capabilityState);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const [modeState, routerConfigResult, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readOutputRouterConfig(ctx.cwd),
      readCapabilityState(ctx.cwd, ctx),
    ]);
    const cognitiveRoutingRuntime = cognitiveRoutingController?.state();
    const promptCapabilityState =
      capabilityState.cognitiveRouting?.effective === true && cognitiveRoutingRuntime?.effective === true
        ? capabilityState
        : capabilityState.cognitiveRouting?.effective === true
          ? {
              ...capabilityState,
              cognitiveRouting: {
                ...capabilityState.cognitiveRouting,
                effective: false,
                blockingReason: {
                  code: "disabled",
                  message: "Cognitive Routing is inactive for this Pi runtime",
                },
              },
            }
          : capabilityState;
    const freeflowContext = await getRuntimeContext(promptCapabilityState);
    setModeStatus(ctx, modeState, capabilityState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    await applyCapabilityToolVisibility(pi, ctx, capabilityState);
    const freeflowRuntimeContext = runtimeContext(
      modeState,
      freeflowContext,
      routerConfigResult,
      promptCapabilityState,
      cognitiveRoutingRuntime,
    );
    const workflowMessage = workflowBootstrapMessage(freeflowContext, capabilityState, ctx.sessionManager);
    const systemPrompt = freeflowRuntimeContext
      ? `${event.systemPrompt}\n\n${freeflowRuntimeContext}`
      : event.systemPrompt;
    return { message: workflowMessage, systemPrompt };
  });

  pi.on("context", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx);
    if (capabilityState.skills.effective) {
      return undefined;
    }

    const messages = event.messages.filter(
      (message) => !(message?.role === "custom" && message?.customType === WORKFLOW_BOOTSTRAP_MESSAGE_TYPE),
    );
    return messages.length === event.messages.length ? undefined : { messages };
  });

  pi.on("tool_call", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd, ctx);
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
    const capabilityState = await readCapabilityState(ctx.cwd, ctx);
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
    getArgumentCompletions: freeflowCompletions,
    handler: async (args, ctx) => {
      if (await handleCognitiveRoutingProfileCommand(args, ctx, cognitiveRoutingController)) {
        await applyCapabilityToolVisibility(pi, ctx);
        return;
      }
      await handleFreeflowCommand(
        args,
        ctx,
        async () => {
          await applyLiveCapabilityState(pi, ctx);
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
      await handleOutputRouterCommand(args, ctx, async () => {
        await applyLiveCapabilityState(pi, ctx);
      });
    },
  });
}
