import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RequestHistory } from "./host/request-history.js";
import { registerProviderSupport } from "./provider-support/index.js";
import { CacheHealth } from "./provider-support/cache/health.js";
import { CacheMonitor } from "./provider-support/cache/monitor.js";
import { RoutingRuntime } from "./cognitive-routing/runtime.js";
import { applyRoutingToolVisibility, registerRoutingTools } from "./cognitive-routing/tools.js";
import { handleFreeflowCommand } from "./host/settings/freeflow-command.js";
import { toolExecutionSections } from "./tool-execution/prompt.js";
import { FileTracking } from "./tool-execution/file-tracking.js";
import { tagProjectedMessages } from "./host/projection-tags.js";
import { trustLoadedSession } from "./host/read-only-session.js";
import { takeStage } from "./host/staging.js";
import {
  CONTRIBUTOR_COMMANDS,
  WORKFLOW_COMMANDS,
  freeflowModelSkillPaths,
  STABLE_FREEFLOW_SURFACE,
  skillPrompt,
} from "./host/catalog.js";
import { readCapabilityState, restoreSessionOverrides, writeStagedSessionOverrides } from "./host/config.js";
import {
  getRuntimeContext,
  hasUsableMandatoryPrompts,
  isPromptAvailable,
  refreshRuntimeContext,
  stableRuntimeContext,
} from "./host/prompts.js";
import { filterBootstrapMessage, withFreeflowRuntimeState, type RuntimeStateAnchor } from "./host/runtime-state.js";
import { setFreeflowStatus } from "./host/status.js";

type FreeflowAPI = ExtensionAPI;
async function sendSkillCommand(pi: FreeflowAPI, ctx: ExtensionCommandContext, skill: string, args?: string) {
  const state = await readCapabilityState(ctx.cwd, ctx);
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

function freeflowCompletions(prefix: string | undefined, routingAvailable: boolean) {
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
          ["profile helper", "helper", "Hold Helper manually when enabled"],
          ["profile executor", "executor", "Hold Executor manually when enabled"],
          ["profile auto", "auto", "Return to automatic Coordinator reconciliation"],
          ["profile history", "history", "Read routing observations"],
        ]
      : [
          ["settings", "settings", "Open personal override settings"],
          ["status", "status", "Show effective Freeflow state"],
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

export default function freeflow(pi: FreeflowAPI) {
  // Cache diagnostics are reported to /freeflow status; the footer only shows current settings.
  const cacheMonitor = new CacheMonitor();
  // Only an explicit master-switch disable turns provider support off; unconfigured repositories keep it.
  const providerSupport = registerProviderSupport(
    pi,
    () => !(capability?.configured === true && capability.enabled === false),
    cacheMonitor,
  );
  const api = pi as any;
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const routing = new RoutingRuntime(api, [packageRoot]);
  // A Coordinator waiting on its worker will resume, so its prompt cache is worth keeping warm.
  providerSupport.keepAlive.setHoldSource(() => routing.suspendedCoordinator());
  // A worker may share the Coordinator's model; each profile keeps its own warmed request.
  providerSupport.keepAlive.setRequesterSource(() => routing.observationScope().profile);
  const requestHistory = new RequestHistory(api, cacheMonitor);
  // Where the Freeflow Runtime State was last placed on paths that bypass request history.
  const runtimeStateAnchor: RuntimeStateAnchor = {};
  const resetHistory = () => {
    requestHistory.reset();
    delete runtimeStateAnchor.content;
    delete runtimeStateAnchor.index;
  };
  let capability: any;
  const files = new FileTracking();
  const toolExecutionEffective = () => capability?.toolExecution?.effective === true;
  const cacheHealth = new CacheHealth();
  let prompts: any;
  let refreshState = true;
  // Pi's event contexts read the host model and effort live. Its interactive shortcut contexts copy them at the
  // key press, so after a switch they still name the previous model; routing must never judge a switch by them.
  let liveHost: any;
  const withLiveModel = (ctx: any) =>
    Object.defineProperties(
      { ...ctx },
      {
        model: { enumerable: true, get: () => liveHost?.model ?? ctx.model },
        thinkingLevel: { enumerable: true, get: () => api.getThinkingLevel?.() ?? ctx.thinkingLevel },
      },
    );
  let surfaceGeneration = 0;

  const unavailable = (state: any, message: string) => ({
    ...state,
    effective: false,
    blockingReason: { code: "unavailable", message },
  });
  async function loadSurface(ctx: any) {
    const generation = surfaceGeneration;
    const next = await readCapabilityState(ctx.cwd, ctx);
    const loaded = await getRuntimeContext(STABLE_FREEFLOW_SURFACE);
    if (generation !== surfaceGeneration) throw new Error("Discarded surface preparation for a replaced session.");
    if (!hasUsableMandatoryPrompts(loaded)) {
      for (const key of ["cognitiveRouting", "toolExecution"])
        next[key] = unavailable(next[key], "Mandatory Freeflow prompts are unavailable.");
    }
    if (next.cognitiveRouting.effective && !isPromptAvailable(loaded.cognitiveRoutingPrompt))
      next.cognitiveRouting = unavailable(next.cognitiveRouting, "Routing bootstrap cue is unavailable.");
    capability = next;
    prompts = loaded;
    return next;
  }
  function status(ctx: any) {
    applyRoutingToolVisibility(api, routing, capability?.cognitiveRouting?.effective === true);
    setFreeflowStatus(ctx, capability, routing.state(), prompts);
  }
  // Control and setting changes made between prompts are staged; their net effect is written as a prompt starts.
  function writeStagedControl(ctx: any) {
    const staged = takeStage(ctx.sessionManager);
    routing.writeStaged(staged.events);
    writeStagedSessionOverrides(staged.overrides, api, ctx.sessionManager);
  }
  async function update(ctx: any) {
    const next = await loadSurface(ctx);
    await routing.refresh(ctx, next.cognitiveRouting);
    status(ctx);
    refreshState = true;
  }

  registerRoutingTools(api, routing);
  pi.on("resources_discover", async (event, ctx) => {
    const state = capability ?? (await loadSurface(ctx ?? { cwd: (event as any)?.cwd ?? process.cwd() }));
    return {
      skillPaths: freeflowModelSkillPaths(
        { ...STABLE_FREEFLOW_SURFACE, toolExecution: state.toolExecution },
        isPromptAvailable(prompts?.toolExecutionPrompt),
      ),
    };
  });
  pi.on("session_start", async (event, ctx) => {
    liveHost = ctx;
    const generation = ++surfaceGeneration;
    resetHistory();
    // Pi has just loaded this native session. Future acknowledgment checks read only new JSONL tail bytes.
    trustLoadedSession(ctx.sessionManager);
    routing.unbind();
    capability = undefined;
    prompts = undefined;
    refreshState = true;
    restoreSessionOverrides(ctx);
    await refreshRuntimeContext(STABLE_FREEFLOW_SURFACE);
    if (generation !== surfaceGeneration) return;
    await loadSurface(ctx);
    cacheHealth.reset();
    files.reset();
    await routing.bind(ctx, capability.cognitiveRouting, (event as any)?.reason !== "reload");
    status(ctx);
  });
  pi.on("session_shutdown", async () => {
    surfaceGeneration++;
    files.reset();
    resetHistory();
    routing.unbind();
    capability = undefined;
    prompts = undefined;
  });
  pi.on("before_agent_start", async (event, ctx) => {
    await update(ctx);
    try {
      await routing.beforeRun(ctx);
    } finally {
      // Pi reports a handler error and still sends the prompt, so the fixed guidance section and the staged
      // control must never be skipped: a missing section would change the cached prompt head.
      // After the run's own reconciliation, so everything staged lands ahead of the prompt in one pass.
      writeStagedControl(ctx);
      status(ctx);
      // Pi 0.87 records changed sections at their native transcript position.
      // Returning systemPrompt would force one replacement head for every request.
      const sections = event.systemPromptOptions.sections;
      if (capability?.toolExecution?.effective === true) {
        // Environment facts precede Freeflow's guidance, which is re-inserted after them.
        delete sections.freeflow_guidance;
        Object.assign(sections, toolExecutionSections(event.systemPrompt, api.getSettings?.()?.shellPath));
      }
      sections.freeflow_guidance = stableRuntimeContext(prompts);
    }
  });
  pi.on("message_end", (event, ctx) => {
    const message = (event as any).message;
    if (
      capability?.enabled === true &&
      message?.role === "assistant" &&
      message.usage &&
      message.stopReason !== "error"
    ) {
      const scope = routing.observationScope();
      const lifetime = ctx.model?.promptCache?.[process.env.PI_CACHE_RETENTION === "long" ? "long" : "short"];
      const warning = cacheHealth.observe({
        provider: message.provider,
        model: message.model,
        thinking: ctx.thinkingLevel,
        at: Date.now(),
        input: message.usage.input ?? 0,
        cacheRead: message.usage.cacheRead ?? 0,
        cacheWrite: message.usage.cacheWrite ?? 0,
        ...(scope.control === "automatic" && scope.profile !== "solo" ? { lane: scope.profile } : {}),
        ...(typeof lifetime === "number" ? { ttlMs: lifetime * 1000 } : {}),
      });
      if (warning) ctx.ui?.notify?.(warning, "warning");
    }
    routing.messageEnd((event as any).message);
  });
  pi.on("tool_call", async (event, ctx) => {
    const gate = routing.preflight(event, ctx);
    if ((gate as any)?.block || !toolExecutionEffective()) return gate;
    return (await files.toolCall(event, ctx)) ?? gate;
  });
  pi.on("tool_result", async (event, ctx) => (toolExecutionEffective() ? files.toolResult(event, ctx) : undefined));
  pi.on("turn_end", async (event, ctx) => {
    await routing.turnEnd(event, ctx);
    files.clearPending();
    status(ctx);
  });
  pi.on("agent_settled", async (_event, ctx) => {
    await routing.settled(ctx);
    await update(ctx);
  });
  pi.on("model_select", async (_event, ctx) => {
    cacheHealth.noteSwitch();
    await routing.nativeChange(ctx);
    status(ctx);
  });
  pi.on("thinking_level_select", async (_event, ctx) => {
    cacheHealth.noteSwitch();
    await routing.nativeChange(ctx);
    status(ctx);
  });
  pi.on("context_with_system", async (event, ctx) => {
    writeStagedControl(ctx);
    if (!capability) await loadSurface(ctx);
    // Entry identity lets attribution and request history skip hashing unchanged native history.
    tagProjectedMessages(
      event.messages,
      ctx.sessionManager?.buildSessionProjection?.(),
      ctx.sessionManager?.getBranch?.() ?? [],
    );
    let messages = event.messages.map(filterBootstrapMessage).filter(Boolean);
    messages = withFreeflowRuntimeState(messages, capability, routing.state(), prompts, {
      force: refreshState,
      anchor: runtimeStateAnchor,
      projectionFailure: routing.state().projectionFailure,
    });
    refreshState = false;
    // Disabled Freeflow pays no per-request provenance work; re-enabling rebuilds it from session history.
    const projected = capability?.enabled === true ? await routing.context(ctx, messages) : messages;
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
  const restore = async (ctx: any, navigation = true) => {
    cacheHealth.noteBreak();
    resetHistory();
    // Navigation selects another branch, whose reads differ; compaction keeps the branch and its file state.
    if (navigation) files.invalidate();
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
      handler: async (shortcutCtx) => {
        const ctx = withLiveModel(shortcutCtx);
        if (!ctx.isIdle()) {
          ctx.ui.notify("Wait for Pi to become idle before changing control.", "warning");
          return;
        }
        ctx.ui.notify(JSON.stringify(await routing.cycleManualProfile()), "info");
        await update(ctx);
      },
    });
    pi.registerShortcut("ctrl+shift+a", {
      description: "Release manual hold to Automatic Coordinator",
      handler: async (shortcutCtx) => {
        const ctx = withLiveModel(shortcutCtx);
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
            getArgumentCompletions: (prefix: string) =>
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
    description: "Freeflow settings, status, profile control, and saved-operation resume",
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
      await handleFreeflowCommand(args, ctx, async () => update(ctx), pi, routing, {
        status: () => ({ cacheHealth: [...cacheHealth.status(), ...cacheMonitor.lines()] }),
      });
    },
  });
}
