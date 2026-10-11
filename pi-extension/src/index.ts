import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { calculateContextTokens, compact as piCompact, estimateTokens } from "@earendil-works/pi-coding-agent";
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
import { Inbound, renderNotice } from "./host/inbound.js";
import { backgroundRefusal } from "./tool-execution/bash-guard.js";
import { CompactionController, USER_REQUEST, type TurnEnd } from "./compaction/controller.js";
import { applyCompactionTools, registerCompactionTool } from "./compaction/tool.js";
import { strictest } from "./compaction/thresholds.js";
import { SNAPSHOT_TYPE, TASK_ENTRY, TaskMemory, type TaskResult } from "./task-memory/runtime.js";
import { applyTaskMemoryTools, registerTaskMemoryTool } from "./task-memory/tool.js";
import { renderSnapshotMessage } from "./task-memory/render.js";
import { applyAskUserTool, registerAskUserTool } from "./ask-user/tool.js";
import { confirmWithUser } from "./ask-user/ask.js";
import { tagProjectedMessages } from "./host/projection-tags.js";
import { trustStartedSession } from "./host/read-only-session.js";
import { takeStage } from "./host/staging.js";
import {
  CONTRIBUTOR_COMMANDS,
  WORKFLOW_COMMANDS,
  freeflowModelSkillPaths,
  freeflowSkillPath,
  STABLE_FREEFLOW_SURFACE,
  skillPrompt,
} from "./host/catalog.js";
import {
  readCapabilityState,
  restoreSessionOverrides,
  setSessionCoreOverride,
  writeStagedSessionOverrides,
} from "./host/config.js";
import {
  getRuntimeContext,
  hasUsableMandatoryPrompts,
  isPromptAvailable,
  refreshRuntimeContext,
  stableRuntimeContext,
} from "./host/prompts.js";
import { filterBootstrapMessage, withFreeflowRuntimeState, type RuntimeStateAnchor } from "./host/runtime-state.js";
import { setFreeflowStatus } from "./host/status.js";
import { cachedBranch } from "./host/branch.js";
type FreeflowAPI = ExtensionAPI;
const COMPACTION_NOTICE_TYPE = "freeflow-compaction-notice";

/** Estimated size of the full native history plus the system prompt: what a request without projection carries. */
/**
 * The context a turn ended with, as Pi estimates it: the turn's own usage plus the tool results after it. Pi's
 * getContextUsage rebuilds the session projection to find the same numbers. Undefined when the turn has no usable usage
 * (aborted, failed, or none reported), where Pi's own estimate applies.
 */
function turnContextTokens(turn: TurnEnd | undefined): number | undefined {
  const message = turn?.message;
  if (message?.role !== "assistant" || message.stopReason === "aborted" || message.stopReason === "error") return;
  if (!message.usage || calculateContextTokens(message.usage) <= 0) return;
  return (turn!.toolResults ?? []).reduce(
    (sum: number, result: any) => sum + estimateTokens(result),
    calculateContextTokens(message.usage),
  );
}

/** Entry types that add no message to Pi's session projection. */
const NO_MESSAGE = new Set(["custom", "label", "session_info", "model_change", "thinking_level_change"]);
const historyEstimate = new WeakMap<object, { branch: readonly any[]; tokens: number }>();

/**
 * The full history's size, as every message's estimate plus the system prompt. Kept per session and extended by the
 * messages appended since, because the branch only grows between compactions; a compaction, summary or custom
 * message (which Pi's projection may place or replace) recomputes it from Pi's projection.
 */
function fullHistoryTokens(ctx: any): number {
  const manager = ctx.sessionManager;
  const system = Math.ceil((ctx.getSystemPrompt?.() ?? "").length / 4);
  if (!manager?.buildSessionProjection) return system;
  const branch = cachedBranch(manager);
  const previous = historyEstimate.get(manager);
  let tokens: number | undefined;
  if (previous && branch === previous.branch) tokens = previous.tokens;
  else if (
    previous &&
    previous.branch.length > 0 &&
    branch.length >= previous.branch.length &&
    branch[previous.branch.length - 1] === previous.branch.at(-1)
  ) {
    const added = branch.slice(previous.branch.length);
    if (added.every((entry) => entry.type === "message" || NO_MESSAGE.has(entry.type)))
      tokens = added.reduce(
        (sum: number, entry: any) => sum + (entry.type === "message" ? estimateTokens(entry.message) : 0),
        previous.tokens,
      );
  }
  if (tokens === undefined)
    tokens = (manager.buildSessionProjection()?.messages ?? []).reduce(
      (sum: number, message: any) => sum + estimateTokens(message),
      0,
    );
  historyEstimate.set(manager, { branch, tokens });
  return tokens + system;
}
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
    : query.startsWith("task ")
      ? [
          ["task list", "list", "This repository's records, or a project's tasks"],
          ["task new", "new", "Create a task in this repository's project and attach it"],
          ["task attach", "attach", "Attach a record by task ID or path"],
          ["task focus", "focus", "Move the focus to an attached record"],
          ["task detach", "detach", "Detach a record"],
          ["task confirm", "confirm", "Make held records writable here"],
          ["task fanout", "fanout", "Create a child of the focused task with its own worktree"],
          ["task child", "child", "Create a child of a task and attach it here"],
          ["task import", "import", "Move a repository record into a project"],
        ]
      : query.startsWith("project ")
        ? [
            ["project list", "list", "Every project"],
            ["project new", "new", "Create a project and link this repository"],
            ["project link", "link", "Link this repository to a project"],
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
              ["settings", "settings", "Open settings; Tab switches Session, Personal and Repository"],
              ["status", "status", "Show effective Freeflow state"],
              ["compact", "compact", "Prepare, compact and recover now"],
              ["task", "task", "Attach, focus, detach or confirm Working Records (task memory)"],
              ["project", "project", "Create or link a task-memory project"],
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
  const compactionEffective = () => capability?.compaction?.effective === true;
  const taskMemoryEffective = () => capability?.taskMemory?.effective === true;
  const askUserEffective = () => capability?.askUser?.effective === true;
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
    applyToolExecutionTools(api, toolExecutionEffective());
    applyCompactionTools(api, compactionEffective());
    applyTaskMemoryTools(api, taskMemoryEffective());
    applyAskUserTool(api, askUserEffective());
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
  /**
   * Turn Cognitive Routing on for this session when it is off: clear a session "off" (such as the one an outside model
   * change sets), and switch it on for the session if configuration leaves it off. Re-enabling hands control to the
   * automatic Coordinator. Configuration that still blocks routing (no profiles, invalid presets) is reported by the
   * control that follows.
   */
  async function turnRoutingOn(ctx: any) {
    if (capability?.cognitiveRouting?.effective === true || ctx.isIdle?.() === false) return;
    if (capability?.cognitiveRouting?.enabledSource === "session")
      await setSessionCoreOverride("cognitiveRouting.enabled", null, ctx, api);
    if ((await readCapabilityState(ctx.cwd, ctx)).cognitiveRouting?.enabled !== true)
      await setSessionCoreOverride("cognitiveRouting.enabled", true, ctx, api);
    await update(ctx);
  }

  registerRoutingTools(api, routing);
  registerAskUserTool(api, {
    // Under automatic routing only the Coordinator talks to the user; a worker returns the choice in its report.
    refusal: () => {
      const scope = routing.observationScope();
      return scope.control === "automatic" && (scope.profile === "helper" || scope.profile === "executor")
        ? "A Cognitive Routing worker does not ask the user. Put the choice, its options and your recommendation in your report (freeflow_return); the Coordinator asks."
        : undefined;
    },
  });
  registerApplyPatch(api, {
    effective: toolExecutionEffective,
    files: (ctx) => files.forPatch(ctx),
    written: (paths, ctx) => files.written(paths, ctx),
  });
  // Content arriving from outside the turn (host/inbound.ts): background exits now, later monitors and messages.
  const inbound = new Inbound({
    sendMessage: (message, options) => api.sendMessage(message, options),
    sendUserMessage: (content) => api.sendUserMessage(content),
    isIdle: () => liveHost?.isIdle?.(),
  });
  api.registerMessageRenderer?.(NOTICE_TYPE, renderNotice("Background"));
  const backgroundHost = {
    effective: toolExecutionEffective,
    shellPath: () => api.getSettings?.()?.shellPath,
    // An exit notice starts a turn when idle; mid-run it is steered in after the current turn's tool results.
    send: (content: string, details: Record<string, unknown>, triggerTurn: boolean) =>
      inbound.deliver({ customType: NOTICE_TYPE, content, details, wake: triggerTurn }),
  };
  const background = new BackgroundJobs(backgroundHost);
  registerBackgroundTools(api, background, backgroundHost);
  const compaction = new CompactionController({
    effective: compactionEffective,
    routingProfile: () => {
      const state = routing.state();
      return state.effective ? state.activeProfile : undefined;
    },
    routingAssignment: () => routing.currentAssignment(),
    assignmentResults: () => routing.assignmentResults(),
    background: () => background.running().map(({ id, label, outputPath }) => ({ id, label, outputPath })),
    noticePrefix: NOTICE_PREFIX,
    carryEnabled: () => capability?.compaction?.carry !== false,
    nativeRefs: () => capability?.cognitiveRouting?.effective === true,
    resolveRef: (ref: string) => routing.evidenceSource(ref),
    coordinatorUnderProjection: () =>
      capability?.cognitiveRouting?.effective === true &&
      capability.cognitiveRouting.projection === true &&
      routing.state().effective === true &&
      routing.state().activeProfile === "coordinator",
    summarize: async (preparation: any, instructions: string, signal: AbortSignal | undefined, ctx: any) => {
      const auth = await ctx.modelRegistry?.getApiKeyAndHeaders?.(ctx.model);
      if (!ctx.model || !auth?.ok) throw new Error("No request auth for the summarizer");
      const model = auth.baseUrl ? { ...ctx.model, baseUrl: auth.baseUrl } : ctx.model;
      return piCompact(
        preparation,
        model,
        auth.apiKey,
        auth.headers,
        instructions,
        signal,
        api.getThinkingLevel?.(),
        undefined,
        auth.env,
      );
    },
    measure: (ctx: any, turn?: TurnEnd) => {
      // Every model that may receive the full history: the active one and, under routing, each profile's.
      const routingCapability = capability?.cognitiveRouting;
      const models = [ctx.model];
      if (routingCapability?.effective)
        for (const profile of Object.values(routingCapability.profiles ?? {}) as any[])
          models.push(ctx.modelRegistry?.find?.(profile.provider, profile.model));
      const limits = strictest(models, api.getSettings?.());
      if (!limits) return undefined;
      let tokens = turnContextTokens(turn) ?? ctx.getContextUsage?.()?.tokens ?? 0;
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
  const sendSnapshot = (content: string, record: string) =>
    void Promise.resolve(
      api.sendMessage({ customType: SNAPSHOT_TYPE, content, display: true, details: { record } }),
    ).catch(() => {});
  const taskMemory = new TaskMemory({
    effective: taskMemoryEffective,
    routingAutomatic: () =>
      capability?.cognitiveRouting?.effective === true &&
      routing.state()?.effective === true &&
      routing.state()?.controlMode === "automatic",
    append: (data) => api.appendEntry(TASK_ENTRY, data),
    send: sendSnapshot,
    owner: () => ({
      session: liveHost?.sessionManager?.getSessionId?.() ?? "unknown",
      ...(liveHost?.sessionManager?.getSessionFile?.() ? { file: liveHost.sessionManager.getSessionFile() } : {}),
      since: new Date().toISOString(),
    }),
    confirm: async (title, message) => (liveHost?.hasUI ? confirmWithUser(liveHost, title, message) : false),
    cwd: () => liveHost?.cwd ?? process.cwd(),
    packageRoot,
  });
  // A delivered resume view shows as one line naming the task; expanding shows the view the model received.
  api.registerMessageRenderer?.(SNAPSHOT_TYPE, (message: any, options: any, theme: any) =>
    renderSnapshotMessage(message, options, theme),
  );
  registerTaskMemoryTool(api, {
    memory: taskMemory,
    changed: (ctx) => {
      refreshState = true;
      status(ctx);
    },
  });
  // /freeflow project: the user creates projects and links repositories to them; the model never does (D-015).
  async function projectCommand(rest: string, ctx: any) {
    if (!taskMemoryEffective()) {
      ctx.ui.notify("Task memory is off. Turn it on in /freeflow settings (Task Memory).", "warning");
      return;
    }
    const [sub, ...words] = rest.trim().split(/\s+/).filter(Boolean);
    // --worktrees <dir>: where fan-out puts this project's child worktrees.
    const at = words.indexOf("--worktrees");
    const worktrees = at >= 0 ? words.splice(at, 2)[1] : undefined;
    const name = words.join(" ");
    try {
      if (sub === "new" && name) {
        const slug = await taskMemory.registry.createProject(name, ctx.cwd, worktrees);
        ctx.ui.notify(`Project ${slug} created and linked to this repository.`, "info");
      } else if (sub === "link" && name) {
        const slug = await taskMemory.registry.linkProject(name, ctx.cwd, worktrees);
        ctx.ui.notify(`This repository is linked to project ${slug}.`, "info");
      } else if (sub === "list") {
        const result = await taskMemory.projects(ctx.cwd);
        ctx.ui.notify(result.text, result.ok ? "info" : "warning");
      } else {
        const found = await taskMemory.registry.projectFor(ctx.cwd);
        ctx.ui.notify(
          found
            ? `Project ${found.project.name} (${found.slug}), store ${found.project.store}.\n${await taskMemory.list(ctx.cwd)}`
            : "This repository is not linked to a project. Use /freeflow project new <name> or link <name>.",
          "info",
        );
      }
    } catch (error: any) {
      ctx.ui.notify(error?.message ?? String(error), "warning");
    }
  }
  // /freeflow task: the user's own attach, focus, detach and confirm, and a picker over this repository's records.
  async function taskCommand(rest: string, ctx: any) {
    if (!taskMemoryEffective()) {
      ctx.ui.notify("Task memory is off. Turn it on in /freeflow settings (Task Memory).", "warning");
      return;
    }
    const [sub, ...words] = rest.trim().split(/\s+/).filter(Boolean);
    let action = sub?.toLowerCase();
    let target = words.join(" ");
    if (!action || action === "pick") {
      const records = await taskMemory.records(ctx.cwd);
      if (!records.length || !ctx.hasUI) {
        ctx.ui.notify(await taskMemory.list(ctx.cwd), "info");
        return;
      }
      const labels = records.map((record) => `${taskMemory.name(record)} — ${record}`);
      const chosen = await ctx.ui.select("Task records", labels);
      if (!chosen) return;
      target = records[labels.indexOf(chosen)];
      action = taskMemory.state().attached.includes(target) ? "focus" : "attach";
    }
    let result: TaskResult;
    if (action === "list") result = { ok: true, text: await taskMemory.list(ctx.cwd, target) };
    else if (action === "new") {
      // The user's own command: create the task in this repository's project and attach it, with no dialog.
      const created = await taskMemory.create(target, target, ctx.cwd);
      result = created.ok && created.id ? await taskMemory.attach(created.id, ctx.cwd) : created;
    } else if (action === "attach") result = await taskMemory.attach(target, ctx.cwd);
    else if (action === "focus") result = await taskMemory.focus(target, ctx.cwd);
    else if (action === "detach") result = await taskMemory.detach(target, ctx.cwd);
    else if (action === "confirm") result = await taskMemory.confirm(target, ctx.cwd);
    else if (action === "child") {
      // From the new session: create a child of the named parent and attach it here.
      const [parent, ...title] = words;
      const created = await taskMemory.child(title.join(" "), title.join(" "), parent);
      const id = /Created child (\S+)/.exec(created.text)?.[1];
      result = created.ok && id ? await taskMemory.attach(id, ctx.cwd) : created;
    } else if (action === "fanout") {
      const title = words.join(" ");
      result = await taskMemory.fanout(title, title);
    } else if (action === "import") {
      const [path, ...project] = words;
      const yes = ctx.hasUI
        ? await confirmWithUser(ctx, "Import record?", `Move ${path} into the ${project.join(" ")} project's store?`)
        : false;
      result = yes
        ? await taskMemory.importRecord(path, project.join(" "), ctx.cwd)
        : { ok: false, text: "Not imported." };
    } else
      result = {
        ok: false,
        text: "Use /freeflow task [list [project]|new <title>|attach <id or record>|focus <id or record>|detach <id or record>|confirm [record]|child <parent-id> <title>|fanout <title>|import <record> <project>].",
      };
    if (result.snapshot) {
      sendSnapshot(result.text, result.snapshot);
      ctx.ui.notify(
        `Task memory: ${(await taskMemory.brief(result.snapshot)).label} is the focus. ${taskMemory.attachedText()}`,
        "info",
      );
    } else if (result.command)
      ctx.ui.notify(`${result.headline ?? result.text}\nRun in a new terminal:\n  ${result.command}`, "info");
    else ctx.ui.notify(result.text, result.ok ? "info" : "warning");
    refreshState = true;
    status(ctx);
  }
  // The user's /freeflow compact makes compaction due now: the agent prepares, compacts and recovers.
  async function compactNow(ctx: any) {
    if (!compactionEffective()) {
      ctx.ui.notify("Freeflow compaction is off; Pi's /compact still works.", "warning");
      return;
    }
    compaction.requestByUser(ctx);
    // The user asked, so this is their message. A user message also starts an ordinary run, which keeps Freeflow's
    // system sections; a run started by an extension message loses them from its second request (Pi #10267).
    const index = compaction.indexText(ctx);
    const text = `${USER_REQUEST}${index ? `\n\n${index}` : ""}`;
    await Promise.resolve(
      api.sendUserMessage(text, ctx.isIdle?.() === false ? { deliverAs: "steer" } : undefined),
    ).catch(() => {});
  }
  pi.on("resources_discover", async (event, ctx) => {
    const state = capability ?? (await loadSurface(ctx ?? { cwd: (event as any)?.cwd ?? process.cwd() }));
    return {
      // Only what this configuration can use (Task 003 D-002): capability skills only while their capability is
      // effective, and while Freeflow is inactive (disabled, unconfigured, or its prompts missing) only Setup Freeflow,
      // so /setup-freeflow still works.
      skillPaths:
        state?.enabled === true && hasUsableMandatoryPrompts(prompts)
          ? freeflowModelSkillPaths(state)
          : [freeflowSkillPath("setup-freeflow")],
    };
  });
  pi.on("session_start", async (event, ctx) => {
    liveHost = ctx;
    const generation = ++surfaceGeneration;
    resetHistory();
    // Where Pi has just parsed this session file, later checks read only the bytes appended since.
    trustStartedSession((event as any)?.reason, ctx.sessionManager);
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
    await routing.bind(ctx, capability.cognitiveRouting, (event as any)?.reason !== "reload");
    taskMemory.rebuild(cachedBranch(ctx.sessionManager));
    if (taskMemoryEffective()) {
      await taskMemory.load();
      // A fork or clone copies the branch's attachments; they stay held until the user confirms them here.
      if ((event as any)?.reason === "fork") {
        const held = taskMemory.holdInherited();
        if (held.length)
          ctx.ui?.notify?.(
            `Task memory: ${held.length} inherited record(s) are held, not writable. Release with /freeflow task confirm.`,
            "info",
          );
      }
      await taskMemory.deliver(cachedBranch(ctx.sessionManager));
      // A session started in a task's directory with nothing attached offers that task (D-017). Not awaited, so
      // startup finishes first and the user answers when the dialog appears; a decline is kept on the branch.
      const suggested = ctx.hasUI ? await taskMemory.suggestion(cachedBranch(ctx.sessionManager)) : undefined;
      if (suggested)
        void (async () => {
          const yes = await confirmWithUser(
            ctx,
            `Attach ${suggested.id}?`,
            `This directory belongs to ${suggested.title} (${suggested.id}). Attach it to this session?`,
          );
          if (generation !== surfaceGeneration) return;
          if (!yes) {
            taskMemory.decline(suggested.record);
            return;
          }
          const result = await taskMemory.attach(suggested.id, ctx.cwd);
          if (result.snapshot) sendSnapshot(result.text, result.snapshot);
          ctx.ui.notify(
            result.ok ? `Task memory: ${suggested.id} attached.` : result.text,
            result.ok ? "info" : "warning",
          );
          refreshState = true;
          status(ctx);
        })().catch(() => {});
    }
    status(ctx);
  });
  pi.on("session_shutdown", async () => {
    surfaceGeneration++;
    // Background processes belong to this extension instance; none may report into the next session.
    await background.stopAll();
    inbound.reset();
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
      // Nothing of Freeflow while it is disabled or unconfigured (Task 003 D-002).
      if (capability?.enabled === true && hasUsableMandatoryPrompts(prompts))
        sections.freeflow_guidance = stableRuntimeContext(prompts, {
          routing: capability?.cognitiveRouting?.effective === true,
        });
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
    // A run started by an extension's message (a background notice, for one) gets the same preparation as a prompt.
    if (routing.startedByMessage((event as any).message)) {
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
    const recordGate = await taskMemory.gate(event.toolName, event.input, ctx.cwd);
    if (recordGate) return recordGate;
    const gate = routing.preflight(event, ctx);
    if ((gate as any)?.block || !toolExecutionEffective()) return gate;
    const refusal = event.toolName === "bash" ? backgroundRefusal((event.input as any)?.command) : undefined;
    if (refusal) return { block: true, reason: refusal };
    return (await files.toolCall(event, ctx)) ?? gate;
  });
  pi.on("tool_result", async (event, ctx) => (toolExecutionEffective() ? files.toolResult(event, ctx) : undefined));
  pi.on("turn_end", async (event, ctx) => {
    await routing.turnEnd(event, ctx);
    files.clearPending();
    status(ctx);
    const compacting = await compaction.turnEnd(event, ctx);
    if (compacting) {
      // The focused record arrives after the summary, so recovery starts from it rather than a path to look up.
      const snapshot = await taskMemory.snapshotEntry();
      if (snapshot) compacting.entries.push(snapshot);
      return compacting;
    }
    const notice = compaction.observe(ctx, event);
    if (notice) {
      // Mid-run the notice joins the next request; when the run is ending it waits for the next prompt rather than
      // starting work nobody asked for.
      const midRun = ((event.message as any)?.content ?? []).some((block: any) => block?.type === "toolCall");
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
  // A model or effort picked in Pi itself (/model, Shift+Tab) ends automatic routing. Routing then turns off for this
  // session through its Session switch, so settings and the footer show it off, and any routing control turns it on.
  const externalChange = async (ctx: any) => {
    cacheHealth.noteSwitch();
    if (await routing.nativeChange(ctx)) {
      await setSessionCoreOverride("cognitiveRouting.enabled", false, ctx, api);
      await update(ctx);
    }
    status(ctx);
  };
  pi.on("model_select", async (_event, ctx) => externalChange(ctx));
  pi.on("thinking_level_select", async (_event, ctx) => externalChange(ctx));
  pi.on("context_with_system", async (event, ctx) => {
    writeStagedControl(ctx);
    if (!capability) await loadSurface(ctx);
    // Entry identity lets attribution and request history skip hashing unchanged native history.
    tagProjectedMessages(
      event.messages,
      ctx.sessionManager?.buildSessionProjection?.(),
      cachedBranch(ctx.sessionManager) ?? [],
    );
    let messages = event.messages.map(filterBootstrapMessage).filter(Boolean);
    messages = withFreeflowRuntimeState(messages, capability, routing.state(), prompts, {
      force: refreshState,
      anchor: runtimeStateAnchor,
      projectionFailure: routing.state().projectionFailure,
      taskMemory: taskMemory.runtimeLines(),
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
  pi.on("session_tree", async (_event, ctx) => {
    // Task memory follows the branch: the records attached at this point of the conversation.
    const before = taskMemory.state();
    const changed = taskMemory.rebuild(cachedBranch(ctx.sessionManager));
    if (taskMemoryEffective()) await taskMemory.load();
    await restore(ctx);
    if (!taskMemoryEffective()) return;
    if (changed) {
      const focus = taskMemory.state().focus;
      ctx.ui?.notify?.(
        `Task memory follows this branch: focus ${before.focus ? taskMemory.name(before.focus) : "none"} -> ${focus ? taskMemory.name(focus) : "none"}. ${taskMemory.attachedText()} Change it with /freeflow task.`,
        "info",
      );
    }
    await taskMemory.deliver(cachedBranch(ctx.sessionManager));
  });
  // Pi compacting on its own (threshold, overflow, /compact) keeps its summarizer and kept tail, with Freeflow's additions.
  pi.on("session_before_compact", async (event, ctx) => compaction.fallback(event, ctx));
  pi.on("session_compact", async (_event, ctx) => {
    await restore(ctx, false);
    background.restate();
    await taskMemory.deliver(cachedBranch(ctx.sessionManager));
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
        await turnRoutingOn(ctx);
        ctx.ui.notify(JSON.stringify(await routing.cycleManualProfile()), "info");
        await update(ctx);
      },
    });
    pi.registerShortcut("ctrl+shift+a", {
      description: "Turn Cognitive Routing on, or release a manual hold, to the automatic Coordinator",
      handler: async (shortcutCtx) => {
        const ctx = withLiveModel(shortcutCtx);
        if (!ctx.isIdle()) {
          ctx.ui.notify("Wait for Pi to become idle before changing control.", "warning");
          return;
        }
        await turnRoutingOn(ctx);
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
      const task = /^task(?:\s+(.*))?$/i.exec((args ?? "").trim());
      if (task) {
        await taskCommand(task[1] ?? "", ctx);
        return;
      }
      const project = /^project(?:\s+(.*))?$/i.exec((args ?? "").trim());
      if (project) {
        await projectCommand(project[1] ?? "", ctx);
        return;
      }
      if ((args ?? "").trim().toLowerCase() === "compact") {
        await compactNow(ctx);
        return;
      }
      // A routing control (a hold or `auto`) turns routing on first when it is off.
      if (/^profile\s+(?!history\b)\S/i.test((args ?? "").trim())) await turnRoutingOn(ctx);
      if (await routing.command(args ?? "", ctx)) {
        await update(ctx);
        return;
      }
      await handleFreeflowCommand(args, ctx, async () => update(ctx), pi, routing, {
        status: () => ({
          cacheHealth: [...cacheHealth.status(), ...cacheMonitor.lines()],
          backgroundRunning: background.running().length,
          compaction: compaction.statusText(ctx),
          taskMemory: taskMemory.attachedText(),
        }),
      });
    },
  });
}
