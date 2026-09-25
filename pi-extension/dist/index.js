import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RequestHistory } from "./runtime/request-history.js";
import { registerProviderSupport } from "./provider-support/index.js";
import { registerProviderObservation } from "./provider-support/observation.js";
import { EfficiencyObserver } from "./efficiency/observation.js";
import { registerToolRuntimeTools } from "./tool-runtime/tools.js";
import { ToolRuntime } from "./tool-runtime/index.js";
import { publishCooperatingAdapterEndpoint } from "./tool-runtime/adapters/protocol.js";
import { EffectRuntime } from "./tool-runtime/effects.js";
import { ResultRuntime } from "./tool-runtime/results/runtime.js";
import { ProgramHost } from "./tool-runtime/program/host.js";
import { RoutingRuntime } from "./cognitive-routing-v2/runtime.js";
import { workersForDelegation } from "./cognitive-routing-v2/types.js";
import { applyRoutingToolVisibility, registerRoutingTools } from "./cognitive-routing-v2/tools.js";
import { handleFreeflowCommand } from "./settings/settings-ui.js";
import { isPiFlowHost } from "./runtime/runtime-identity.js";
import {
  CONTRIBUTOR_COMMANDS,
  WORKFLOW_COMMANDS,
  freeflowModelSkillPaths,
  getRuntimeContext,
  hasUsableMandatoryPrompts,
  isPromptAvailable,
  readCapabilityState,
  refreshRuntimeContext,
  restoreSessionOverrides,
  stableRuntimeContext,
  STABLE_FREEFLOW_SURFACE,
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
    : query.startsWith("efficiency ")
      ? [["efficiency export", "export", "Export bounded factual efficiency JSON"]]
      : query.startsWith("profile ") && routingAvailable
        ? [
            ["profile coordinator", "coordinator", "Hold Coordinator manually"],
            ["profile helper", "helper", "Hold Helper manually when enabled"],
            ["profile executor", "executor", "Hold Executor manually when enabled"],
            ["profile auto", "auto", "Return to automatic Coordinator reconciliation"],
            ["profile history", "history", "Read routing observations"],
          ]
        : [
            ["settings", "settings", "Open personal override settings"],
            ["status", "status", "Show effective Freeflow state"],
            ["efficiency", "efficiency", "Show factual Tool Execution and provider observations"],
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
  registerProviderSupport(pi);
  const api = pi;
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const routing = new RoutingRuntime(api, [packageRoot]);
  const requestHistory = new RequestHistory(api);
  // Where the Freeflow Runtime State was last placed on paths that bypass request history.
  const runtimeStateAnchor = {};
  const resetHistory = () => {
    requestHistory.reset();
    delete runtimeStateAnchor.content;
    delete runtimeStateAnchor.index;
  };
  let capability;
  const results = new ResultRuntime(
    api,
    () => capability?.toolExecution,
    () => routing.observationScope(),
    (id) => routing.resultReadAccess(id),
  );
  routing.setResultGrantPort({ resolve: (id, ctx) => results.resolveGrant(id, ctx) });
  const effects = new EffectRuntime(api);
  routing.setEffectFencePort(effects);
  const toolRuntime = new ToolRuntime(
    () => capability?.toolExecution,
    {
      scope: (ctx) => routing.operationScope(ctx),
      responsibility: () => routing.observationScope(),
      admit: (fence, effect, operation) => routing.admitOperation(fence, effect, operation),
      admitProgram: (fence) => routing.admitProgram(fence),
    },
    {
      read: (input, signal, host) => results.readValue(input, signal, host),
    },
    effects,
  );
  publishCooperatingAdapterEndpoint(toolRuntime.adapters);
  const programs = new ProgramHost(api, toolRuntime, () => capability?.toolExecution);
  const efficiency = new EfficiencyObserver(
    api,
    () => routing.observationScope(),
    () => capability?.toolExecution?.effective === true && capability?.toolExecution?.accounting?.effective === true,
  );
  registerProviderObservation(api, efficiency);
  let prompts;
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
    const loaded = await getRuntimeContext(STABLE_FREEFLOW_SURFACE);
    if (generation !== surfaceGeneration) throw new Error("Discarded surface preparation for a replaced session.");
    if (!hasUsableMandatoryPrompts(loaded)) {
      for (const key of ["cognitiveRouting", "toolExecution"])
        next[key] = unavailable(next[key], "Mandatory Freeflow prompts are unavailable.");
    }
    if (next.cognitiveRouting.effective && !isPromptAvailable(loaded.cognitiveRoutingPrompt))
      next.cognitiveRouting = unavailable(next.cognitiveRouting, "Routing bootstrap cue is unavailable.");
    if (next.cognitiveRouting.enabled && isPiFlowHost(pi.host))
      next.cognitiveRouting = unavailable(
        next.cognitiveRouting,
        "The redesigned PiFlow adapter requires separate qualification.",
      );
    if (next.toolExecution.enabled && isPiFlowHost(pi.host))
      next.toolExecution = unavailable(
        next.toolExecution,
        "Tool Execution requires separate PiFlow host qualification.",
      );
    capability = next;
    toolRuntime.refreshAdapters();
    prompts = loaded;
    sessionContext = ctx;
    return next;
  }
  function status(ctx) {
    applyRoutingToolVisibility(api, routing, capability?.cognitiveRouting?.effective === true);
    setFreeflowStatus(ctx, capability, routing.state(), prompts, {
      toolExecutionRuntime: {
        ...results.status(),
        ...programs.status(),
        ...effects.status(),
        ...toolRuntime.status(),
      },
    });
  }
  async function update(ctx) {
    const next = await loadSurface(ctx);
    await routing.refresh(ctx, next.cognitiveRouting);
    status(ctx);
    refreshState = true;
  }
  registerRoutingTools(api, routing);
  registerToolRuntimeTools(api, () => capability?.toolExecution, {
    invokeTools: (callId, input, signal, ctx, progress) =>
      toolRuntime.invokeTools(callId, input, signal, ctx, progress),
    runProgram: (callId, input, signal, ctx, progress) => programs.run(callId, input, signal, ctx, progress),
    readResult: async (input, signal, ctx, progress) => {
      progress?.publish({
        version: 1,
        tool: "freeflow_result",
        phase: "running",
        activity: "Reading verified captured bytes",
      });
      const result = await results.read(input, signal, ctx);
      progress?.publish(
        {
          version: 1,
          tool: "freeflow_result",
          phase: "settling",
          activity: "Verified captured range",
        },
        true,
      );
      return result;
    },
  });
  pi.on("resources_discover", async (event, ctx) => {
    const state = capability ?? (await loadSurface(ctx ?? { cwd: event?.cwd ?? process.cwd() }));
    return { skillPaths: freeflowModelSkillPaths(STABLE_FREEFLOW_SURFACE) };
  });
  pi.on("session_start", async (event, ctx) => {
    const generation = ++surfaceGeneration;
    resetHistory();
    routing.unbind();
    capability = undefined;
    prompts = undefined;
    refreshState = true;
    restoreSessionOverrides(ctx);
    const initial = await readCapabilityState(ctx.cwd, ctx, pi.host);
    await refreshRuntimeContext(STABLE_FREEFLOW_SURFACE);
    if (generation !== surfaceGeneration) return;
    await loadSurface(ctx);
    efficiency.reset(ctx);
    results.reset();
    programs.reset();
    effects.reset();
    await effects.recover(ctx);
    await routing.bind(ctx, capability.cognitiveRouting, event?.reason !== "reload");
    status(ctx);
  });
  pi.on("session_shutdown", async () => {
    surfaceGeneration++;
    resetHistory();
    routing.unbind();
    efficiency.reset();
    results.reset();
    programs.reset();
    effects.reset();
    capability = undefined;
    prompts = undefined;
    sessionContext = undefined;
  });
  pi.on("before_agent_start", async (event, ctx) => {
    await update(ctx);
    await routing.beforeRun(ctx);
    status(ctx);
    // Pi 0.87 records changed sections at their native transcript position.
    // Returning systemPrompt would force one replacement head for every request.
    event.systemPromptOptions.sections.freeflow_guidance = stableRuntimeContext(prompts);
  });
  pi.on("message_end", (event, ctx) => {
    routing.messageEnd(event.message);
    efficiency.messageEnd(event.message, ctx);
  });
  pi.on("tool_call", (event, ctx) => {
    const gate = routing.preflight(event, ctx);
    if (!gate?.block) {
      try {
        results.toolCall(event, ctx);
      } catch {
        // Optional capture preparation cannot block the admitted native tool.
      }
    }
    return gate;
  });
  pi.on("tool_result", async (event, ctx) => {
    const capture = await results.capture(event, ctx);
    const direct = toolRuntime.patchResult(event);
    const program = programs.patchResult(event);
    return capture || direct || program ? { ...(capture ?? {}), ...(direct ?? {}), ...(program ?? {}) } : undefined;
  });
  pi.on("turn_end", async (event, ctx) => {
    await routing.turnEnd(event, ctx);
    results.turnEnd(event);
    efficiency.turnEnd(event, ctx);
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
  pi.on("context_with_system", async (event, ctx) => {
    if (!capability) await loadSurface(ctx);
    let messages = event.messages.map(filterBootstrapMessage).filter(Boolean);
    messages = withFreeflowRuntimeState(messages, capability, routing.state(), prompts, {
      force: refreshState,
      anchor: runtimeStateAnchor,
      projectionFailure: routing.state().projectionFailure,
      toolExecutionRuntime: {
        ...results.status(),
        ...programs.status(),
        ...effects.status(),
        ...toolRuntime.status(),
      },
    });
    refreshState = false;
    const projected = await routing.context(ctx, messages);
    const state = routing.state();
    if (projected.some((message) => message.details?.routingRequestBlocked === true)) {
      // Routing must not expose hidden worker history on failure, but Pi's full-
      // transcript hook still requires the leading system prompt/tool state.
      const head = event.messages[0]?.role === "system" ? [event.messages[0]] : [];
      return { messages: [...head, ...projected] };
    }
    const view = routing.projectionEnabled && state.activeProfile === "coordinator" ? "coordinator" : "ordinary";
    return {
      messages: await requestHistory.assemble(projected, view, ctx, (assembled) =>
        routing.budgetNotice(assembled, ctx),
      ),
    };
  });
  const restore = async (ctx, navigation = true) => {
    resetHistory();
    efficiency.reset(ctx);
    results.reset();
    programs.reset();
    effects.reset();
    await effects.recover(ctx);
    restoreSessionOverrides(ctx);
    refreshState = true;
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
      description: "Cycle enabled Cognitive Routing manual holds",
      handler: async (ctx) => {
        if (!ctx.isIdle()) {
          ctx.ui.notify("Wait for Pi to become idle before changing control.", "warning");
          return;
        }
        const state = routing.state();
        const profiles = ["coordinator", ...workersForDelegation(state.delegation)];
        const current = profiles.indexOf(state.activeProfile ?? "coordinator");
        const target = profiles[(current + 1) % profiles.length];
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
    description: "Freeflow settings, status, efficiency, profile control, and saved-operation resume",
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
      if (input === "efficiency" || input === "efficiency export") {
        if (!capability?.toolExecution?.accounting?.effective) {
          ctx.ui.notify("Freeflow Tool Execution accounting is disabled.", "warning");
          return;
        }
        ctx.ui.notify(
          JSON.stringify(input.endsWith("export") ? efficiency.exportData() : efficiency.report(), null, 2),
          "info",
        );
        return;
      }
      await handleFreeflowCommand(args, ctx, async () => update(ctx), pi, routing, {
        status: () => ({ ...results.status(), ...programs.status(), ...effects.status(), ...toolRuntime.status() }),
      });
    },
  });
}
