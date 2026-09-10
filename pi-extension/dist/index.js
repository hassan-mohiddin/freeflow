import { RoutingRuntime } from "./cognitive-routing-v2/runtime.js";
import { applyRoutingToolVisibility, registerRoutingTools } from "./cognitive-routing-v2/tools.js";
import { ConversationHistoryRuntime } from "./conversation-history/runtime.js";
import { FreeflowContextRuntime } from "./freeflow-context/runtime.js";
import { CONTEXT_VIRTUALIZATION_TOOL_NAME, registerFreeflowContextTool } from "./freeflow-context/tool.js";
import { handleContextCommand } from "./context-virtualization/commands.js";
import { ContextVirtualizationRuntime } from "./context-virtualization/runtime.js";
import { handleFreeflowCommand } from "./settings/settings-ui.js";
import { isPiFlowHost } from "./runtime/runtime-identity.js";
import {
  CONTRIBUTOR_COMMANDS,
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
  withFreeflowRuntimeState,
} from "./runtime/runtime-context.js";
async function sendSkillCommand(pi, ctx, skill, args) {
  const state = await readCapabilityState(ctx.cwd, ctx, pi.host);
  if (skill === "setup-freeflow" && !state.configured) {
    await pi.sendUserMessage(skillPrompt(skill, args), { expandPromptTemplates: true });
    return;
  }
  if (!state.configured || !state.enabled) {
    ctx.ui.notify("Run /setup-freeflow or enable Freeflow before dispatching this skill.", "warning");
    return;
  }
  const prompts = await getRuntimeContext(state);
  if (!hasUsableMandatoryPrompts(prompts)) {
    ctx.ui.notify("Freeflow core prompts are unavailable; the requested skill cannot be dispatched.", "warning");
    return;
  }
  await pi.sendUserMessage(skillPrompt(skill, args), { expandPromptTemplates: true });
}
function freeflowCompletions(prefix, routingAvailable) {
  const query = prefix ?? "";
  const choices = query.startsWith("settings ")
    ? [
        ["settings session", "session", "Override Freeflow for this Pi session"],
        ["settings local", "local", "Edit personal overrides for this repository"],
        ["settings repo", "repo", "Edit shared repository settings"],
      ]
    : query.startsWith("profile ") && routingAvailable
      ? [
          ["profile coordinator", "coordinator", "Hold Coordinator manually"],
          ["profile executor", "executor", "Hold Executor manually"],
          ["profile auto", "auto", "Return to automatic Coordinator reconciliation"],
          ["profile history", "history", "Read routing observations"],
        ]
      : query.startsWith("context ")
        ? [
            ["context status", "status", "Show Freeflow Context state"],
            ["context list", "list", "List archived context projections"],
            ["context restore", "restore", "Restore one or more context references"],
            ["context reset all", "reset all", "Reset projection decisions on the active branch"],
          ]
        : [
            ["settings", "settings", "Open personal override settings"],
            ["status", "status", "Show effective Freeflow state"],
            ["context", "context", "Inspect Freeflow Context"],
            ...(routingAvailable
              ? [
                  ["profile", "profile", "Hold or release Cognitive Routing profile control"],
                  ["resume", "resume", "Resume the current saved routing responsibility"],
                ]
              : []),
            ["enable", "enable", "Enable Freeflow for this repository"],
            ["disable", "disable", "Disable Freeflow for this repository"],
          ];
  return choices
    .filter(([value]) => value.startsWith(query))
    .map(([value, label, description]) => ({ value, label, description }));
}
export default function freeflow(pi) {
  const api = pi;
  const routing = new RoutingRuntime(api);
  let capability;
  let prompts;
  let context;
  let virtualization;
  let history;
  let refreshState = true;
  let sessionContext;
  let surfaceGeneration = 0;
  const unavailable = (state, message) => ({
    ...state,
    effective: false,
    blockingReason: { code: "unavailable", message },
  });
  async function loadSurface(ctx) {
    const generation = surfaceGeneration;
    const next = await readCapabilityState(ctx.cwd, ctx, pi.host);
    const loaded = await getRuntimeContext(next);
    if (generation !== surfaceGeneration) throw new Error("Discarded surface preparation for a replaced session.");
    if (!hasUsableMandatoryPrompts(loaded)) {
      for (const key of ["cognitiveRouting", "contextVirtualization", "conversationHistory"])
        next[key] = unavailable(next[key], "Mandatory Freeflow prompts are unavailable.");
    }
    if (next.cognitiveRouting.effective && !isPromptAvailable(loaded.cognitiveRoutingPrompt))
      next.cognitiveRouting = unavailable(next.cognitiveRouting, "Routing bootstrap cue is unavailable.");
    if (next.contextVirtualization.effective && !isPromptAvailable(loaded.contextVirtualizationPrompt))
      next.contextVirtualization = unavailable(
        next.contextVirtualization,
        "Context Virtualization guidance is unavailable.",
      );
    if (next.conversationHistory.effective && !isPromptAvailable(loaded.conversationHistoryPrompt))
      next.conversationHistory = unavailable(next.conversationHistory, "Conversation History guidance is unavailable.");
    // The existing reduction engine is not the future Context Control port. Do not pretend
    // its independent transform ordering has been qualified with the new projection.
    if (
      next.cognitiveRouting.effective &&
      next.cognitiveRouting.projection &&
      (next.contextVirtualization.effective || next.conversationHistory.effective)
    )
      next.cognitiveRouting = unavailable(
        next.cognitiveRouting,
        "New routing projection with legacy context transforms is not qualified. Disable that combination explicitly.",
      );
    if (next.cognitiveRouting.enabled && isPiFlowHost(pi.host))
      next.cognitiveRouting = unavailable(
        next.cognitiveRouting,
        "The redesigned PiFlow adapter requires separate qualification.",
      );
    capability = next;
    prompts = loaded;
    sessionContext = ctx;
    return next;
  }
  function contextTools() {
    registerFreeflowContextTool(
      api,
      () => virtualization,
      () => history,
      {
        contextVirtualization: capability?.contextVirtualization?.effective === true,
        conversationHistory: capability?.conversationHistory?.effective === true,
      },
    );
    if (api.getActiveTools && api.setActiveTools) {
      const current = new Set(api.getActiveTools());
      if (capability?.contextVirtualization?.effective || capability?.conversationHistory?.effective)
        current.add(CONTEXT_VIRTUALIZATION_TOOL_NAME);
      else current.delete(CONTEXT_VIRTUALIZATION_TOOL_NAME);
      const next = [...current];
      if (JSON.stringify(next) !== JSON.stringify(api.getActiveTools())) api.setActiveTools(next);
    }
  }
  function status(ctx) {
    applyRoutingToolVisibility(api, routing, capability?.cognitiveRouting?.effective === true);
    setFreeflowStatus(ctx, capability, routing.state(), prompts);
  }
  async function update(ctx) {
    const next = await loadSurface(ctx);
    await routing.refresh(ctx, next.cognitiveRouting);
    contextTools();
    status(ctx);
    refreshState = true;
  }
  registerRoutingTools(api, routing);
  registerFreeflowContextTool(
    api,
    () => virtualization,
    () => history,
    { contextVirtualization: false, conversationHistory: false },
  );
  pi.on("resources_discover", async (event, ctx) => {
    const state = capability ?? (await loadSurface(ctx ?? { cwd: event?.cwd ?? process.cwd() }));
    if (!state.configured) return { skillPaths: [freeflowSkillPath("setup-freeflow")] };
    return { skillPaths: state.enabled && hasUsableMandatoryPrompts(prompts) ? freeflowModelSkillPaths(state) : [] };
  });
  pi.on("session_start", async (event, ctx) => {
    const generation = ++surfaceGeneration;
    routing.unbind();
    capability = undefined;
    prompts = undefined;
    refreshState = true;
    restoreSessionOverrides(ctx);
    const initial = await readCapabilityState(ctx.cwd, ctx, pi.host);
    await refreshRuntimeContext(initial);
    if (generation !== surfaceGeneration) return;
    await loadSurface(ctx);
    context = new FreeflowContextRuntime(ctx);
    virtualization = new ContextVirtualizationRuntime(pi, ctx, context);
    history = new ConversationHistoryRuntime(
      ctx,
      (entryId) => virtualization?.isSourceFullyProjected(entryId) ?? true,
      context,
    );
    await virtualization.recover(ctx);
    await routing.bind(ctx, capability.cognitiveRouting, event?.reason !== "reload");
    contextTools();
    status(ctx);
  });
  pi.on("session_shutdown", async () => {
    surfaceGeneration++;
    routing.unbind();
    context = undefined;
    virtualization = undefined;
    history = undefined;
    capability = undefined;
    prompts = undefined;
    sessionContext = undefined;
  });
  pi.on("before_agent_start", async (event, ctx) => {
    await update(ctx);
    await routing.beforeRun(ctx);
    status(ctx);
    const text = runtimeContext(prompts, capability);
    return { systemPrompt: text ? `${event.systemPrompt}\n\n${text}` : event.systemPrompt };
  });
  pi.on("message_end", (event) => routing.messageEnd(event.message));
  pi.on("tool_call", (event, ctx) => {
    if (
      event.toolName === CONTEXT_VIRTUALIZATION_TOOL_NAME &&
      !capability?.contextVirtualization?.effective &&
      !capability?.conversationHistory?.effective
    )
      return { block: true, reason: "Freeflow Context is disabled." };
    return routing.preflight(event, ctx);
  });
  pi.on("turn_end", async (event, ctx) => {
    await routing.turnEnd(event, ctx);
    status(ctx);
  });
  pi.on("agent_settled", async (_event, ctx) => {
    await routing.settled(ctx);
    await update(ctx);
  });
  pi.on("model_select", async (_event, ctx) => {
    await routing.nativeChange(ctx);
    status(ctx);
  });
  pi.on("thinking_level_select", async (_event, ctx) => {
    await routing.nativeChange(ctx);
    status(ctx);
  });
  pi.on("context", async (event, ctx) => {
    if (!capability) await loadSurface(ctx);
    let messages = event.messages.map(filterBootstrapMessage).filter(Boolean);
    if (virtualization) {
      virtualization.setContext(ctx);
      const projected = await virtualization.project(messages, capability.contextVirtualization.effective);
      messages = projected.messages;
    }
    if (history && capability.conversationHistory.effective) {
      history.setContext(ctx);
      history.capture(capability.contextVirtualization.effective);
    }
    messages = withFreeflowRuntimeState(messages, capability, routing.state(), prompts, {
      force: refreshState,
      projectionFailure: routing.state().projectionFailure,
    });
    refreshState = false;
    return { messages: await routing.context(ctx, messages) };
  });
  const restore = async (ctx, navigation = true) => {
    restoreSessionOverrides(ctx);
    refreshState = true;
    if (virtualization) {
      virtualization.setContext(ctx);
      await virtualization.recover(ctx);
    }
    history?.setContext(ctx);
    await routing.ancestryChanged(ctx, navigation);
    await update(ctx);
  };
  pi.on("session_tree", async (_event, ctx) => restore(ctx));
  pi.on("session_compact", async (_event, ctx) => restore(ctx, false));
  pi.on("session_compact_failed", async (_event, ctx) => {
    refreshState = true;
    status(ctx);
  });
  if (
    typeof pi.registerShortcut === "function" &&
    typeof api.appendEntry === "function" &&
    typeof api.setModel === "function" &&
    typeof api.setThinkingLevel === "function"
  ) {
    pi.registerShortcut("ctrl+shift+r", {
      description: "Cycle the Coordinator/Executor manual hold",
      handler: async (ctx) => {
        if (!ctx.isIdle()) {
          ctx.ui.notify("Wait for Pi to become idle before changing control.", "warning");
          return;
        }
        const target = routing.state().activeProfile === "coordinator" ? "executor" : "coordinator";
        ctx.ui.notify(JSON.stringify(await routing.setManualProfile(target)), "info");
        await update(ctx);
      },
    });
    pi.registerShortcut("ctrl+shift+a", {
      description: "Release manual hold to Automatic Coordinator",
      handler: async (ctx) => {
        if (!ctx.isIdle()) {
          ctx.ui.notify("Wait for Pi to become idle before changing control.", "warning");
          return;
        }
        ctx.ui.notify(JSON.stringify(await routing.setAutomaticControl()), "info");
        await update(ctx);
      },
    });
  }
  for (const { command, skill } of WORKFLOW_COMMANDS)
    pi.registerCommand(command, {
      description: command === skill ? `Run Freeflow ${skill}` : `Run Freeflow ${skill} via ${command}`,
      ...(command === "bypass"
        ? {
            getArgumentCompletions: (prefix) =>
              [
                { value: "next", label: "next", description: "Skip one optional step" },
                { value: "task", label: "task", description: "Reduce optional pressure for the current task" },
              ].filter((item) => item.value.startsWith(prefix ?? "")),
          }
        : {}),
      handler: (args, ctx) => sendSkillCommand(pi, ctx, skill, args),
    });
  for (const skill of CONTRIBUTOR_COMMANDS)
    pi.registerCommand(skill, {
      description: `Run Freeflow ${skill}`,
      handler: (args, ctx) => sendSkillCommand(pi, ctx, skill, args),
    });
  pi.registerCommand("freeflow", {
    description: "Freeflow settings, status, profile control, saved-operation resume, and context tools",
    getArgumentCompletions: (prefix) =>
      freeflowCompletions(
        prefix,
        typeof api.appendEntry === "function" &&
          typeof api.setModel === "function" &&
          typeof api.setThinkingLevel === "function",
      ),
    handler: async (args, ctx) => {
      if (await routing.command(args ?? "", ctx)) {
        await update(ctx);
        return;
      }
      const input = (args ?? "").trim();
      if (input === "context" || input.startsWith("context ")) {
        await handleContextCommand(
          input.slice(7).trim(),
          ctx,
          virtualization,
          capability?.contextVirtualization.effective,
          capability?.conversationHistory.effective,
        );
        return;
      }
      await handleFreeflowCommand(args, ctx, async () => update(ctx), pi, routing);
    },
  });
}
