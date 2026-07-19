import { handleNativeToolSafetyNet } from "./native-safety-net.js";
import { handleObservedToolRouting } from "./observed-tool-routing.js";
import { registerRouterTools } from "./router-tools.js";
import { handleFreeflowCommand, handleOutputRouterCommand } from "./settings-ui.js";
import {
  CONTRIBUTOR_COMMANDS,
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
} from "./runtime-context.js";
function isOutputRouterToolName(name) {
  return OUTPUT_ROUTER_TOOL_NAMES.includes(name);
}
async function applyCapabilityToolVisibility(pi, ctx, capabilityState = undefined) {
  if (typeof pi?.setActiveTools !== "function" || typeof pi?.getAllTools !== "function") {
    return;
  }
  const state = capabilityState ?? (await readCapabilityState(ctx.cwd));
  const allToolNames = pi
    .getAllTools()
    .map((tool) => tool?.name)
    .filter(Boolean);
  const allToolNameSet = new Set(allToolNames);
  const currentActive = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : undefined;
  const active = new Set(
    (Array.isArray(currentActive) ? currentActive : allToolNames).filter((name) => allToolNameSet.has(name)),
  );
  if (allToolNameSet.has(FREEFLOW_STATUS_TOOL_NAME)) {
    if (state.configured && state.enabled) active.add(FREEFLOW_STATUS_TOOL_NAME);
    else active.delete(FREEFLOW_STATUS_TOOL_NAME);
  }
  for (const toolName of OUTPUT_ROUTER_TOOL_NAMES) {
    if (!allToolNameSet.has(toolName)) continue;
    if (state.outputRouter.enabled) active.add(toolName);
    else active.delete(toolName);
  }
  pi.setActiveTools([...active]);
}
async function applyLiveCapabilityState(pi, ctx) {
  const [modeState, capabilityState] = await Promise.all([readModeState(ctx.cwd), readCapabilityState(ctx.cwd)]);
  await refreshRuntimeContext(capabilityState);
  setModeStatus(ctx, modeState, capabilityState);
  await applyCapabilityToolVisibility(pi, ctx, capabilityState);
}
function disabledToolCall(toolName, capability) {
  const command = capability === "freeflow" ? "/freeflow settings" : `/${capability} settings`;
  return {
    block: true,
    reason: `${toolName} is disabled by Freeflow config. Configure ${capability} with ${command}.`,
  };
}
function capabilityCompletions(prefix) {
  const query = prefix ?? "";
  return [
    { value: "settings", label: "settings", description: "Open repository Output Router settings" },
    { value: "status", label: "status", description: "Show effective Output Router state" },
    { value: "enable", label: "enable", description: "Enable Output Router for this repository" },
    { value: "disable", label: "disable", description: "Disable Output Router for this repository" },
  ].filter((item) => item.value.startsWith(query));
}
function freeflowCompletions(prefix) {
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
  const state = await readCapabilityState(ctx.cwd);
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
  registerRouterTools(pi);
  pi.on("resources_discover", async (event, ctx) => {
    const cwd = ctx?.cwd ?? event?.cwd ?? process.cwd();
    const state = await readCapabilityState(cwd);
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
      readCapabilityState(ctx.cwd),
    ]);
    await refreshRuntimeContext(capabilityState);
    setModeStatus(ctx, modeState, capabilityState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    await applyCapabilityToolVisibility(pi, ctx, capabilityState);
  });
  pi.on("session_tree", async (_event, ctx) => {
    restoreModeOverride(ctx);
    await applyLiveCapabilityState(pi, ctx);
  });
  pi.on("session_compact", async (_event, ctx) => {
    const [modeState, routerConfigResult, capabilityState] = await Promise.all([
      readModeState(ctx.cwd),
      readOutputRouterConfig(ctx.cwd),
      readCapabilityState(ctx.cwd),
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
      readCapabilityState(ctx.cwd),
    ]);
    const freeflowContext = await getRuntimeContext(capabilityState);
    setModeStatus(ctx, modeState, capabilityState);
    notifyRouterConfigWarnings(ctx, routerConfigResult);
    await applyCapabilityToolVisibility(pi, ctx, capabilityState);
    const freeflowRuntimeContext = runtimeContext(modeState, freeflowContext, routerConfigResult, capabilityState);
    const workflowMessage = workflowBootstrapMessage(freeflowContext, capabilityState, ctx.sessionManager);
    const systemPrompt = freeflowRuntimeContext
      ? `${event.systemPrompt}\n\n${freeflowRuntimeContext}`
      : event.systemPrompt;
    return { message: workflowMessage, systemPrompt };
  });
  pi.on("context", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd);
    if (capabilityState.skills.effective) {
      return undefined;
    }
    const messages = event.messages.filter(
      (message) => !(message?.role === "custom" && message?.customType === WORKFLOW_BOOTSTRAP_MESSAGE_TYPE),
    );
    return messages.length === event.messages.length ? undefined : { messages };
  });
  pi.on("tool_call", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd);
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
    const capabilityState = await readCapabilityState(ctx.cwd);
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
      await handleFreeflowCommand(
        args,
        ctx,
        async () => {
          await applyLiveCapabilityState(pi, ctx);
        },
        pi,
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
