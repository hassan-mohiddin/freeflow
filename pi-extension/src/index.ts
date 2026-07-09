import { handleNativeToolSafetyNet } from "./native-safety-net.js";
import { handleObservedToolRouting } from "./observed-tool-routing.js";
import { registerRouterTools } from "./router-tools.js";
import { handleDelegationHarnessCommand, handleFreeflowCommand, handleOutputRouterCommand } from "./settings-ui.js";
import { registerDelegation } from "./delegation/index.js";
import {
  appendDelegatedRuntimeContext,
  handleDelegatedAssistantMessageEnd,
  handleDelegatedToolCall,
  handleDelegationSessionStart,
} from "./delegation/runtime.js";
import {
  CONTRIBUTOR_COMMANDS,
  WORKFLOW_COMMANDS,
  FREEFLOW_STATUS_TOOL_NAME,
  freeflowModelSkillPaths,
  freeflowSkillPath,
  getRuntimeContext,
  handleWorkflowCommand,
  OUTPUT_ROUTER_TOOL_NAMES,
  readCapabilityState,
  readModeState,
  readOutputRouterConfig,
  refreshRuntimeContext,
  restoreModeOverride,
  runtimeContext,
  setModeStatus,
  skillPrompt,
  notifyRouterConfigWarnings,
} from "./runtime-context.js";

function isDelegationToolName(name: string): boolean {
  return name.startsWith("delegate_");
}

function isOutputRouterToolName(name: string): boolean {
  return OUTPUT_ROUTER_TOOL_NAMES.includes(name);
}

async function applyCapabilityToolVisibility(pi: any, ctx: any, capabilityState = undefined): Promise<void> {
  if (typeof pi?.setActiveTools !== "function" || typeof pi?.getAllTools !== "function") {
    return;
  }

  const state = capabilityState ?? await readCapabilityState(ctx.cwd);
  const allToolNames = pi.getAllTools().map((tool: any) => tool?.name).filter(Boolean);
  const allToolNameSet = new Set(allToolNames);
  const currentActive = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : undefined;
  const active = new Set((Array.isArray(currentActive) ? currentActive : allToolNames).filter((name: string) => allToolNameSet.has(name)));

  if (allToolNameSet.has(FREEFLOW_STATUS_TOOL_NAME)) {
    if (state.configured && state.enabled) active.add(FREEFLOW_STATUS_TOOL_NAME);
    else active.delete(FREEFLOW_STATUS_TOOL_NAME);
  }

  for (const toolName of OUTPUT_ROUTER_TOOL_NAMES) {
    if (!allToolNameSet.has(toolName)) continue;
    if (state.outputRouter.enabled) active.add(toolName);
    else active.delete(toolName);
  }

  for (const toolName of allToolNames.filter(isDelegationToolName)) {
    if (state.delegationHarness.enabled) active.add(toolName);
    else active.delete(toolName);
  }

  pi.setActiveTools([...active]);
}

async function applyLiveCapabilityState(pi: any, ctx: any): Promise<void> {
  const [modeState, capabilityState] = await Promise.all([
    readModeState(ctx.cwd),
    readCapabilityState(ctx.cwd),
  ]);
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
  return ["settings", "status", "enable", "disable"].filter((value) => value.startsWith(query)).map((value) => ({ value, label: value }));
}

async function sendSkillCommand(pi: any, ctx: any, skill: string, args: string | undefined) {
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
    ctx.ui.notify("Freeflow is disabled for this repo. Use /freeflow enable or /freeflow settings to re-enable it.", "warning");
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
  registerDelegation(pi);

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
    if (capabilityState.delegationHarness.enabled) {
      await handleDelegationSessionStart(pi, ctx);
    }
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
    if (capabilityState.delegationHarness.enabled) {
      await handleDelegationSessionStart(pi, ctx);
    }
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
    const systemPrompt = freeflowRuntimeContext
      ? `${event.systemPrompt}\n\n${freeflowRuntimeContext}`
      : event.systemPrompt;
    return {
      systemPrompt: capabilityState.delegationHarness.enabled
        ? await appendDelegatedRuntimeContext(pi, event, ctx, systemPrompt)
        : systemPrompt,
    };
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
    if (!capabilityState.delegationHarness.enabled && isDelegationToolName(toolName)) {
      return disabledToolCall(toolName, "delegation-harness");
    }
    if (capabilityState.delegationHarness.enabled) {
      return handleDelegatedToolCall(event, ctx, pi);
    }
    return undefined;
  });

  pi.on("message_end", async (event, ctx) => {
    const capabilityState = await readCapabilityState(ctx.cwd);
    if (!capabilityState.delegationHarness.enabled) {
      return undefined;
    }
    return handleDelegatedAssistantMessageEnd(event, ctx);
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
    getArgumentCompletions: capabilityCompletions,
    handler: async (args, ctx) => {
      const result = await handleFreeflowCommand(args, ctx, async () => {
        await applyLiveCapabilityState(pi, ctx);
      });
      if (result.changed && !result.reloaded) {
        await applyLiveCapabilityState(pi, ctx);
      }
    },
  });

  pi.registerCommand("output-router", {
    description: "Open Freeflow Output Router settings or print compact status",
    getArgumentCompletions: capabilityCompletions,
    handler: async (args, ctx) => {
      const result = await handleOutputRouterCommand(args, ctx, async () => {
        await applyLiveCapabilityState(pi, ctx);
      });
      if (result.changed && !result.reloaded) {
        await applyLiveCapabilityState(pi, ctx);
      }
    },
  });

  pi.registerCommand("delegation-harness", {
    description: "Open Freeflow Delegation Harness settings or print compact status",
    getArgumentCompletions: capabilityCompletions,
    handler: async (args, ctx) => {
      const result = await handleDelegationHarnessCommand(args, ctx, async () => {
        await applyLiveCapabilityState(pi, ctx);
      });
      if (result.changed && !result.reloaded) {
        await applyLiveCapabilityState(pi, ctx);
      }
    },
  });

  pi.registerCommand("workflow", {
    description: "Set or inspect the current Freeflow session mode",
    getArgumentCompletions: (prefix) => {
      const query = prefix ?? "";
      const values = ["conversation", "workflow", "strict-workflow", "reset"];
      const filtered = values.filter((value) => value.startsWith(query));
      return filtered.map((value) => ({ value, label: value }));
    },
    handler: async (args, ctx) => {
      await handleWorkflowCommand(args, ctx, pi);
    },
  });
}
