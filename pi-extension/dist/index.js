import { estimateTokens } from "@earendil-works/pi-coding-agent";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RequestHistory } from "./host/request-history.js";
import { registerProviderSupport } from "./provider-support/index.js";
import { CacheHealth } from "./provider-support/cache/health.js";
import { CacheMonitor } from "./provider-support/cache/monitor.js";
import { RoutingRuntime } from "./cognitive-routing/runtime.js";
import { applyRoutingToolVisibility, registerRoutingTools } from "./cognitive-routing/tools.js";
import { handleFreeflowCommand } from "./host/settings/freeflow-command.js";
import { toolExecutionSections, toolExecutionTail } from "./tool-execution/prompt.js";
import { FileTracking } from "./tool-execution/file-tracking.js";
import { registerApplyPatch } from "./tool-execution/apply-patch/tool.js";
import { applyToolExecutionTools } from "./tool-execution/tools.js";
import { BackgroundJobs, NOTICE_PREFIX, NOTICE_TYPE, registerBackgroundTools } from "./tool-execution/background.js";
import { backgroundRefusal } from "./tool-execution/bash-guard.js";
import { CompactionController } from "./compaction/controller.js";
import { applyCompactionTools, registerCompactionTool } from "./compaction/tool.js";
import { strictest } from "./compaction/thresholds.js";
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
import { filterBootstrapMessage, withFreeflowRuntimeState } from "./host/runtime-state.js";
import { setFreeflowStatus } from "./host/status.js";
const COMPACTION_NOTICE_TYPE = "freeflow-compaction-notice";
/** Estimated size of the full native history plus the system prompt: what a request without projection carries. */
function fullHistoryTokens(ctx) {
  const messages = ctx.sessionManager?.buildSessionProjection?.()?.messages ?? [];
  const system = ctx.getSystemPrompt?.() ?? "";
  return messages.reduce((sum, message) => sum + estimateTokens(message), Math.ceil(system.length / 4));
}
async function sendSkillCommand(pi, ctx, skill, args) {
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
          ["profile helper", "helper", "Hold Helper manually when enabled"],
          ["profile executor", "executor", "Hold Executor manually when enabled"],
          ["profile auto", "auto", "Return to automatic Coordinator reconciliation"],
          ["profile history", "history", "Read routing observations"],
        ]
      : [
          ["settings", "settings", "Open personal override settings"],
          ["status", "status", "Show effective Freeflow state"],
          ["compact", "compact", "Prepare, compact and recover now"],
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
  // Cache diagnostics are reported to /freeflow status; the footer only shows current settings.
  const cacheMonitor = new CacheMonitor();
  // Only an explicit master-switch disable turns provider support off; unconfigured repositories keep it.
  const providerSupport = registerProviderSupport(
    pi,
    () => !(capability?.configured === true && capability.enabled === false),
    cacheMonitor,
  );
  const api = pi;
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const routing = new RoutingRuntime(api, [packageRoot]);
  // A Coordinator waiting on its worker will resume, so its prompt cache is worth keeping warm.
  providerSupport.keepAlive.setHoldSource(() => routing.suspendedCoordinator());
  // A worker may share the Coordinator's model; each profile keeps its own warmed request.
  providerSupport.keepAlive.setRequesterSource(() => routing.observationScope().profile);
  const requestHistory = new RequestHistory(api, cacheMonitor);
  // Where the Freeflow Runtime State was last placed on paths that bypass request history.
  const runtimeStateAnchor = {};
  const resetHistory = () => {
    requestHistory.reset();
    delete runtimeStateAnchor.content;
    delete runtimeStateAnchor.index;
  };
  let capability;
  const files = new FileTracking();
  const toolExecutionEffective = () => capability?.toolExecution?.effective === true;
  const compactionEffective = () => capability?.compaction?.effective === true;
  const cacheHealth = new CacheHealth();
  let prompts;
  let refreshState = true;
  // Pi's event contexts read the host model and effort live. Its interactive shortcut contexts copy them at the
  // key press, so after a switch they still name the previous model; routing must never judge a switch by them.
  let liveHost;
  const withLiveModel = (ctx) =>
    Object.defineProperties(
      { ...ctx },
      {
        model: { enumerable: true, get: () => liveHost?.model ?? ctx.model },
        thinkingLevel: { enumerable: true, get: () => api.getThinkingLevel?.() ?? ctx.thinkingLevel },
      },
    );
  let surfaceGeneration = 0;
  const unavailable = (state, message) => ({
    ...state,
    effective: false,
    blockingReason: { code: "unavailable", message },
  });
  async function loadSurface(ctx) {
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
  function status(ctx) {
    applyRoutingToolVisibility(api, routing, capability?.cognitiveRouting?.effective === true);
    applyToolExecutionTools(api, toolExecutionEffective());
    applyCompactionTools(api, compactionEffective());
    setFreeflowStatus(ctx, capability, routing.state(), prompts);
  }
  // Control and setting changes made between prompts are staged; their net effect is written as a prompt starts.
  function writeStagedControl(ctx) {
    const staged = takeStage(ctx.sessionManager);
    routing.writeStaged(staged.events);
    writeStagedSessionOverrides(staged.overrides, api, ctx.sessionManager);
  }
  async function update(ctx) {
    const next = await loadSurface(ctx);
    await routing.refresh(ctx, next.cognitiveRouting);
    status(ctx);
    refreshState = true;
  }
  registerRoutingTools(api, routing);
  registerApplyPatch(api, {
    effective: toolExecutionEffective,
    files: (ctx) => files.forPatch(ctx),
    written: (paths, ctx) => files.written(paths, ctx),
  });
  const backgroundHost = {
    effective: toolExecutionEffective,
    shellPath: () => api.getSettings?.()?.shellPath,
    // An exit notice starts a turn when idle; mid-run it is steered in after the current turn's tool results.
    send: (content, details, triggerTurn) => {
      const notice = () =>
        Promise.resolve(
          api.sendMessage(
            { customType: NOTICE_TYPE, content, display: true, details },
            triggerTurn ? { triggerTurn: true, deliverAs: "steer" } : { triggerTurn: false },
          ),
        ).catch(() => {});
      // When idle, the notice starts the run as a user message: a run an extension message starts loses Freeflow's
      // system sections from its second request (Pi #10267). If a run started meanwhile, it is steered in instead.
      if (!triggerTurn || liveHost?.isIdle?.() !== true) return notice();
      try {
        return Promise.resolve(api.sendUserMessage(content)).catch(notice);
      } catch {
        return notice();
      }
    },
  };
  const background = new BackgroundJobs(backgroundHost);
  registerBackgroundTools(api, background, backgroundHost);
  const compaction = new CompactionController({
    effective: compactionEffective,
    routingProfile: () => {
      const state = routing.state();
      return state.effective ? state.activeProfile : undefined;
    },
    background: () => background.running().map(({ id, label, outputPath }) => ({ id, label, outputPath })),
    noticePrefix: NOTICE_PREFIX,
    measure: (ctx) => {
      // Every model that may receive the full history: the active one and, under routing, each profile's.
      const routingCapability = capability?.cognitiveRouting;
      const models = [ctx.model];
      if (routingCapability?.effective)
        for (const profile of Object.values(routingCapability.profiles ?? {}))
          models.push(ctx.modelRegistry?.find?.(profile.provider, profile.model));
      const limits = strictest(models, api.getSettings?.());
      if (!limits) return undefined;
      let tokens = ctx.getContextUsage?.()?.tokens ?? 0;
      // A Coordinator under projection sends a reduced view; the next worker request carries the whole history.
      if (
        routingCapability?.effective &&
        routingCapability.projection &&
        routing.state().activeProfile === "coordinator"
      )
        tokens = Math.max(tokens, fullHistoryTokens(ctx));
      return { tokens, thresholds: limits };
    },
  });
  registerCompactionTool(api, compaction);
  // The user's /freeflow compact makes compaction due now: the agent prepares, compacts and recovers.
  async function compactNow(ctx) {
    if (!compactionEffective()) {
      ctx.ui.notify("Freeflow compaction is off; Pi's /compact still works.", "warning");
      return;
    }
    compaction.requestByUser(ctx);
    // The user asked, so this is their message. A user message also starts an ordinary run, which keeps Freeflow's
    // system sections; a run started by an extension message loses them from its second request (Pi #10267).
    // Interim wording; the reviewed texts arrive with the compaction skill.
    const text = `Compact the conversation now. Update the Working Record if one exists, then call freeflow_compact with your summary and what to carry: files by path, tool results by id.\n\n${compaction.indexText(ctx)}`;
    await Promise.resolve(
      api.sendUserMessage(text, ctx.isIdle?.() === false ? { deliverAs: "steer" } : undefined),
    ).catch(() => {});
  }
  pi.on("resources_discover", async (event, ctx) => {
    const state = capability ?? (await loadSurface(ctx ?? { cwd: event?.cwd ?? process.cwd() }));
    return {
      skillPaths: freeflowModelSkillPaths({ ...STABLE_FREEFLOW_SURFACE, toolExecution: state.toolExecution }),
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
    compaction.reset();
    await routing.bind(ctx, capability.cognitiveRouting, event?.reason !== "reload");
    status(ctx);
  });
  pi.on("session_shutdown", async () => {
    surfaceGeneration++;
    // Background processes belong to this extension instance; none may report into the next session.
    await background.stopAll();
    files.reset();
    compaction.reset();
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
      const toolExecution = capability?.toolExecution?.effective === true;
      // Pi's own sections are replaced in place. Freeflow's are re-inserted at the end in a fixed order: its guidance,
      // then Tool Execution's environment facts and guidance.
      if (toolExecution)
        Object.assign(sections, toolExecutionSections(event.systemPrompt, api.getSettings?.()?.shellPath));
      for (const name of ["freeflow_guidance", "environment", "tool_execution"]) delete sections[name];
      sections.freeflow_guidance = stableRuntimeContext(prompts);
      if (toolExecution)
        Object.assign(sections, toolExecutionTail(api.getSettings?.()?.shellPath, prompts?.toolExecutionPrompt));
    }
    // Like Claude Code's next-turn reminder: files the model read that changed while it was not running a tool.
    const changed = toolExecutionEffective() ? await files.changedNotice(ctx, false) : undefined;
    if (changed)
      return { message: { customType: "freeflow-files", content: `${NOTICE_PREFIX} ${changed}`, display: true } };
  });
  pi.on("agent_start", () => routing.runStarted());
  pi.on("message_end", async (event, ctx) => {
    const message = event.message;
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
    routing.messageEnd(event.message);
    // A run started by an extension's message (a background notice, for one) gets the same preparation as a prompt.
    if (routing.startedByMessage(event.message)) {
      await update(ctx);
      try {
        await routing.beforeRun(ctx, false);
      } finally {
        writeStagedControl(ctx);
        status(ctx);
      }
    }
  });
  pi.on("tool_call", async (event, ctx) => {
    const gate = routing.preflight(event, ctx);
    if (gate?.block || !toolExecutionEffective()) return gate;
    const refusal = event.toolName === "bash" ? backgroundRefusal(event.input?.command) : undefined;
    if (refusal) return { block: true, reason: refusal };
    return (await files.toolCall(event, ctx)) ?? gate;
  });
  pi.on("tool_result", async (event, ctx) => (toolExecutionEffective() ? files.toolResult(event, ctx) : undefined));
  pi.on("turn_end", async (event, ctx) => {
    await routing.turnEnd(event, ctx);
    files.clearPending();
    status(ctx);
    const compacting = await compaction.turnEnd(event, ctx);
    if (compacting) return compacting;
    const notice = compaction.observe(ctx);
    if (notice) {
      // Mid-run the notice joins the next request; when the run is ending it waits for the next prompt rather than
      // starting work nobody asked for.
      const midRun = (event.message?.content ?? []).some((block) => block?.type === "toolCall");
      await Promise.resolve(
        api.sendMessage(
          { customType: COMPACTION_NOTICE_TYPE, content: notice.text, display: true, details: { level: notice.level } },
          { deliverAs: midRun ? "steer" : "nextTurn" },
        ),
      ).catch(() => {});
    }
    return undefined;
  });
  // A Freeflow compaction fires no session_compact, so its resets run here, before the new cycle's first request.
  pi.on("turn_start", async (_event, ctx) => {
    const compacted = compaction.takeCompacted();
    if (!compacted) return;
    await restore(ctx, false);
    await files.compacted(compacted.carriedFiles, ctx);
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
  const restore = async (ctx, navigation = true) => {
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
  pi.on("session_compact", async (_event, ctx) => {
    await restore(ctx, false);
    background.restate();
  });
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
    description: "Freeflow settings, status, profile control, and saved-operation resume",
    getArgumentCompletions: (prefix) =>
      freeflowCompletions(
        prefix,
        typeof api.appendEntry === "function" &&
          typeof api.setModel === "function" &&
          typeof api.setThinkingLevel === "function",
      ),
    handler: async (args, ctx) => {
      if ((args ?? "").trim().toLowerCase() === "compact") {
        await compactNow(ctx);
        return;
      }
      if (await routing.command(args ?? "", ctx)) {
        await update(ctx);
        return;
      }
      await handleFreeflowCommand(args, ctx, async () => update(ctx), pi, routing, {
        status: () => ({
          cacheHealth: [...cacheHealth.status(), ...cacheMonitor.lines()],
          backgroundRunning: background.running().length,
        }),
      });
    },
  });
}
