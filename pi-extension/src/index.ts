import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { calculateContextTokens, compact as piCompact, estimateTokens } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RequestHistory } from "./host/request-history.js";
import { registerProviderSupport } from "./provider-support/index.js";
import { CacheHealth } from "./provider-support/cache/health.js";
import { CacheMonitor } from "./provider-support/cache/monitor.js";
import { handleFreeflowCommand } from "./host/settings/freeflow-command.js";
import { toolExecutionSections, toolExecutionTail } from "./tool-execution/prompt.js";
import { FileTracking, withLines } from "./tool-execution/file-tracking.js";
import { GateRuntime } from "./gates/runtime.js";
import { GuidanceNotices } from "./tool-execution/guidance-notices.js";
import { registerApplyPatch } from "./tool-execution/apply-patch/tool.js";
import { applyToolExecutionTools } from "./tool-execution/tools.js";
import {
  BackgroundJobs,
  MONITOR_PER_MINUTE,
  MONITOR_TYPE,
  freeflowNotice,
  NOTICE_TYPE,
  registerBackgroundTools,
} from "./tool-execution/background.js";
import { Inbound, renderNotice } from "./host/inbound.js";
import { currentSections, headSections, keepSections } from "./host/section-keeper.js";
import { backgroundRefusal } from "./tool-execution/bash-guard.js";
import { CompactionController, RECOVERY_TYPE, USER_REQUEST, type TurnEnd } from "./compaction/controller.js";
import { loadNotice, strictest } from "./compaction/thresholds.js";
import {
  StoreLayer,
  claimHoursEnvironment,
  keepStartLedger,
  readStartLedger,
  scriptRunner,
  sessionEnvironment,
  touchesStore,
} from "./store/layer.js";
import { WAITS_KEY, WAIT_BATCH_MS, WaitWatch } from "./store/waits.js";
import { EventRecorder, type ClaimInputs } from "./events/recorder.js";
import { DEFAULT_INBOUND_POLICY } from "./messaging/config.js";
import { MESSAGE_TYPE, Messaging } from "./messaging/messaging.js";
import { freeflowHome } from "./messaging/registry.js";
import { applyMessagingTools, registerMessagingTools } from "./messaging/tools.js";
import { renderMessage } from "./messaging/render.js";
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
import { readCapabilityState, restoreSessionOverrides, writeStagedSessionOverrides } from "./host/config.js";
import {
  getRuntimeContext,
  hasUsableMandatoryPrompts,
  refreshRuntimeContext,
  stableRuntimeContext,
} from "./host/prompts.js";
import { filterBootstrapMessage, withFreeflowRuntimeState, type RuntimeStateAnchor } from "./host/runtime-state.js";
import { setFreeflowStatus } from "./host/status.js";
import { cachedBranch } from "./host/branch.js";
type FreeflowAPI = ExtensionAPI;
const COMPACTION_NOTICE_TYPE = "freeflow-compaction-notice";

/**
 * The file that keeps a session's context cycle in the Freeflow home, beside its claims: the cycle and its notice's time,
 * the same copy the Claude Code mod keeps (cycle.json), so a reload of the extension does not show the notice again.
 */
function cycleFile(ctx: any): string | undefined {
  const id = ctx.sessionManager?.getSessionId?.();
  return id ? join(resolve(freeflowHome()), "sessions", id, "cycle.json") : undefined;
}

function keptCycle(ctx: any): { cycle: number; notice: number | null } | undefined {
  const path = cycleFile(ctx);
  if (!path) return undefined;
  try {
    const kept = JSON.parse(readFileSync(path, "utf8"));
    return {
      cycle: Number(kept.cycle),
      notice: typeof kept.notice === "number" ? kept.notice : null,
    };
  } catch {
    return undefined;
  }
}

function keepCycle(ctx: any, state: { cycle: number; notice: number | null }): void {
  const path = cycleFile(ctx);
  if (!path) return;
  // Written when the notice is shown, once a cycle; a failed write loses only the copy.
  mkdir(dirname(path), { recursive: true })
    .then(() => writeFile(path, `${JSON.stringify(state)}\n`))
    .catch(() => {});
}
// The user's /freeflow compact, delivered as Freeflow's message.
const COMPACT_REQUEST_TYPE = "freeflow-compaction-request";
// The Freeflow store's menu and rules at session start, or what keeps the session from a store.
const STORE_TYPE = "freeflow-store";
const MID_SESSION =
  "Freeflow started mid-session: its session start did not run in this session, so what it gives a session at its start follows now.";

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

/** The sections Freeflow sets: its own, and Pi's rules and docs, which Tool Execution changes. */
const OWN_SECTION_NAMES = ["freeflow_guidance", "environment", "tool_execution", "rules", "docs"];
/**
 * Send a skill command's prompt as the user's message. A command can run while Pi is busy, which from Pi 1.2.0 includes
 * the start of a run (before_agent_start); Pi then refuses a user message without `deliverAs`, so it is queued to
 * follow the current work instead.
 */
function sendSkillPrompt(pi: FreeflowAPI, skill: string, args?: string) {
  pi.sendUserMessage(skillPrompt(skill, args), { expandPromptTemplates: true, deliverAs: "followUp" });
}
async function sendSkillCommand(pi: FreeflowAPI, ctx: ExtensionCommandContext, skill: string, args?: string) {
  const state = await readCapabilityState(ctx.cwd, ctx);
  // Setup Freeflow always dispatches: it is how a missing or broken config is repaired, and Freeflow may be off.
  if (skill === "setup-freeflow") {
    sendSkillPrompt(pi, skill, args);
    return;
  }
  if (state.setupNeeded || !state.enabled) {
    ctx.ui.notify("Run /setup-freeflow or enable Freeflow before dispatching this skill.", "warning");
    return;
  }
  if ((state.skills?.off as readonly string[] | undefined)?.includes(skill)) {
    ctx.ui.notify(`${skill} is turned off in /freeflow settings (Skills).`, "warning");
    return;
  }
  const prompts = await getRuntimeContext(state);
  if (!hasUsableMandatoryPrompts(prompts)) {
    ctx.ui.notify("Freeflow core prompts are unavailable; the requested skill cannot be dispatched.", "warning");
    return;
  }
  sendSkillPrompt(pi, skill, args);
}

function freeflowCompletions(prefix: string | undefined) {
  const query = prefix ?? "";
  const choices = query.startsWith("settings ")
    ? [
        ["settings session", "session", "Override Freeflow for this Pi session"],
        ["settings local", "local", "Edit personal overrides for this repository"],
        ["settings repo", "repo", "Edit shared repository settings"],
      ]
    : [
        ["settings", "settings", "Open settings; Tab switches Session, Personal and Repository"],
        ["status", "status", "Show effective Freeflow state"],
        ["capabilities", "capabilities", "What Freeflow can do in this session, and the event log"],
        ["compact", "compact", "Prepare, compact and recover now"],
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
  // Provider support runs only where Freeflow runs: not while it is off, nor while its setup is needed (D-045, round 3).
  registerProviderSupport(pi, () => capability?.setupNeeded !== true && capability?.enabled !== false, cacheMonitor);
  const api = pi as any;
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  // The notice point comes from Track Work's notice5.mjs, loaded once; no notice is due until it has.
  void loadNotice(packageRoot);
  // The Freeflow store's layer: Track Work's script on Pi's events, as the Claude Code mod is on Claude Code's.
  const runScript = scriptRunner(packageRoot);
  const store = new StoreLayer(runScript);
  // The event log and the claims (SPEC-006): written off the request path, when a run settles and at shutdown.
  const events = new EventRecorder(runScript);
  // The gates (SPEC-008): Track Work's gates5.mjs on each tool call, from the session's gate state kept in memory.
  const gates = new GateRuntime(packageRoot);
  const version = (() => {
    try {
      return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version as string | undefined;
    } catch {
      return undefined;
    }
  })();
  const claimInputs = (): ClaimInputs => ({
    enabled: capability?.enabled === true,
    events: capability?.events?.enabled === true,
    compaction: capability?.compaction?.effective === true,
    messaging: capability?.messaging?.effective === true,
    askUser: capability?.askUser?.effective === true,
  });
  /** The claims follow the capabilities as they change; a file write only when they did, never awaited. */
  const syncClaims = () => {
    events.setOn(capability?.events?.enabled === true);
    void events.writeClaims(claimInputs(), version);
  };
  const trackWork = `node ${resolve(packageRoot, "skills/track-work/scripts/working-record.mjs")}`;
  const requestHistory = new RequestHistory(api, cacheMonitor);
  // Where the Freeflow Runtime State was last placed on paths that bypass request history.
  const runtimeStateAnchor: RuntimeStateAnchor = {};
  const resetHistory = () => {
    requestHistory.reset();
    delete runtimeStateAnchor.content;
    delete runtimeStateAnchor.index;
  };
  let capability: any;
  // The system sections of the last prompt's run, while Freeflow sets sections; see keepSections.
  let ownSections: Record<string, string> | undefined;
  let ownSectionsVersion = 0;
  let ownHead: Record<string, string | null> | undefined;
  // The sections Freeflow sets, and whether the current run is one a prompt started (so its requests carry them), or
  // one an extension's message started that Freeflow still set its sections for (Pi 1.2.0 and later).
  let ownNames: string[] = [];
  let promptRun = false;
  let messageRun = false;
  // Whether the session has had a prompt. Pi before 1.2.0 builds the system prompt only for prompts, so until then a
  // turn Freeflow started for a notice would reach the model with none: notices wait for the user's first prompt.
  let prompted = false;
  // Whether before_agent_start prepared the run about to start, and whether a run started that nothing prepared and
  // whose first message has not been seen yet (an extension's message on Pi before 1.2.0).
  let runPrepared = false;
  let runUnprepared = false;
  const files = new FileTracking();
  const toolExecutionEffective = () => capability?.toolExecution?.effective === true;
  const guidance = new GuidanceNotices(packageRoot);
  const guidanceNoticesEffective = () =>
    toolExecutionEffective() && capability?.toolExecution?.guidanceNotices !== false;
  const compactionEffective = () => capability?.compaction?.effective === true;
  const askUserEffective = () => capability?.askUser?.effective === true;
  const messagingEffective = () => capability?.messaging?.effective === true;
  const cacheHealth = new CacheHealth();
  let prompts: any;
  let refreshState = true;
  // Skills already read, as the Runtime State lists them: taken only where the state refreshes anyway (run
  // boundaries, settings changes, compaction, navigation), so a skill read mid-run adds no state message.
  let stateSkills: string[] = [];
  // The context of the latest session start: Pi's UI and idle state for work that runs outside an event.
  let liveHost: any;
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
      next.toolExecution = unavailable(next.toolExecution, "Mandatory Freeflow prompts are unavailable.");
    }
    capability = next;
    prompts = loaded;
    syncClaims();
    claimHoursEnvironment(next.delegation?.claimHours);
    return next;
  }
  function status(ctx: any) {
    applyToolExecutionTools(api, toolExecutionEffective());
    applyAskUserTool(api, askUserEffective());
    applyMessagingTools(api, messagingEffective());
    syncMessaging(ctx);
    setFreeflowStatus(ctx, capability, prompts, { task: store.heldTask() });
  }
  // Setting changes made between prompts are staged; their net effect is written as a prompt starts.
  function writeStagedSettings(ctx: any) {
    writeStagedSessionOverrides(takeStage(ctx.sessionManager).overrides, api, ctx.sessionManager);
  }
  async function update(ctx: any) {
    await loadSurface(ctx);
    status(ctx);
    refreshState = true;
    stateSkills = toolExecutionEffective() ? files.loadedSkills(ctx) : [];
  }

  registerAskUserTool(api);
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
    canWake: () => prompted,
  });
  // The Waits on row (SPEC-009 4.4): a delegation the current Slice waits on came back.
  const waits = new WaitWatch({
    refresh: () => store.refresh(),
    current: () => store.current(),
    deliver: (text, wake) =>
      inbound.deliver(
        { customType: STORE_TYPE, content: freeflowNotice("store", text), details: { waits: true }, wake },
        { key: WAITS_KEY, windowMs: WAIT_BATCH_MS },
      ),
    wakeOnReturn: () => capability?.delegation?.wakeOnReturn !== false,
  });
  api.registerMessageRenderer?.(NOTICE_TYPE, renderNotice("Background"));
  api.registerMessageRenderer?.(MONITOR_TYPE, renderNotice("Monitor"));
  api.registerMessageRenderer?.(COMPACT_REQUEST_TYPE, renderNotice("Compaction"));
  api.registerMessageRenderer?.(STORE_TYPE, renderNotice("Task memory"));
  // Compaction's warnings and its recovery message, and the changed-file notice: one line each, the rest on expand.
  api.registerMessageRenderer?.(COMPACTION_NOTICE_TYPE, renderNotice("Compaction"));
  api.registerMessageRenderer?.(RECOVERY_TYPE, renderNotice("Compaction"));
  api.registerMessageRenderer?.("freeflow-files", renderNotice("Files"));
  const backgroundHost = {
    effective: toolExecutionEffective,
    shellPath: () => api.getSettings?.()?.shellPath,
    // An exit notice starts a turn when idle; mid-run it is steered in after the current turn's tool results.
    send: (content: string, details: Record<string, unknown>, triggerTurn: boolean) =>
      inbound.deliver({ customType: NOTICE_TYPE, content, details, wake: triggerTurn }),
    // A monitor's lines wake an idle agent (spec O-6); the rate limit bounds what that costs.
    event: (id: string, line: string, join: (lines: string[]) => string, onLimit: () => void) =>
      inbound.deliver(
        { customType: MONITOR_TYPE, content: line, details: { id }, wake: true },
        {
          key: `monitor:${id}`,
          perMinute: MONITOR_PER_MINUTE,
          onLimit,
          join: (notices) => join(notices.map((notice) => notice.content)),
        },
      ),
    endEvents: (id: string) => {
      inbound.flush(`monitor:${id}`);
      inbound.close(`monitor:${id}`);
    },
    discardEvents: (id: string) => inbound.close(`monitor:${id}`),
  };
  const background = new BackgroundJobs(backgroundHost);
  registerBackgroundTools(api, background, backgroundHost);
  const compaction = new CompactionController({
    effective: compactionEffective,
    background: () => background.running().map(({ id, label, outputPath }) => ({ id, label, outputPath })),
    notice: (text: string) => freeflowNotice("compaction", text),
    store: {
      current: () => store.current(),
      refresh: () => store.refresh(),
      runEnded: () => store.runEnded(),
      bundle: (options) => store.bundle(options),
      answered: () => store.answered(),
      command: () => trackWork,
    },
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
    kept: (ctx: any) => keptCycle(ctx),
    keep: (ctx: any, state: { cycle: number; notice: number | null }) => keepCycle(ctx, state),
    measure: (ctx: any, turn?: TurnEnd) => {
      const limits = strictest([ctx.model], api.getSettings?.());
      if (!limits) return undefined;
      return { tokens: turnContextTokens(turn) ?? ctx.getContextUsage?.()?.tokens ?? 0, thresholds: limits };
    },
  });
  /**
   * Session start: the store's menu with the rules every task follows, or what keeps the session from a store, as one
   * Freeflow message for the next turn. Not awaited, so a pull over the network never holds up Pi's start; a reload
   * keeps the conversation, so it only reads the state again.
   */
  const storeStart = async (ctx: any, reason: string | undefined, generation: number) => {
    const held = store.heldTask();
    const session = ctx.sessionManager?.getSessionId?.();
    try {
      if (reason === "reload") await store.refresh();
      else {
        const text = await store.start(ctx.cwd, [ctx.cwd, dirname(ctx.cwd), packageRoot]);
        if (generation !== surfaceGeneration) return;
        if (text) events.freeflow("menu");
        if (text)
          await Promise.resolve(
            api.sendMessage(
              {
                customType: STORE_TYPE,
                content: freeflowNotice("store", `Freeflow task memory:\n${text}`),
                display: true,
                details: {},
              },
              { deliverAs: "nextTurn" },
            ),
          );
        // The start's steps are done: a reload of this session reads that and gives the menu no second time.
        if (session) await keepStartLedger(freeflowHome(), session).catch(() => {});
      }
      // Session status and the take-back wrote the gate state; read it now, once.
      if (generation === surfaceGeneration) await gates.refresh({ settled: true });
      // The footer names the held task; refreshed only when it changed, since a refresh costs a branch walk.
      if (generation === surfaceGeneration && store.heldTask() !== held) status(ctx);
    } catch {
      // The store is optional: without one, compaction works through the session summary (P4).
    }
  };
  /**
   * Freeflow arriving mid-session (SPEC-013): a session whose start ran without Freeflow (a reload that brings it in,
   * `enabled` switched on later) has not had the store's pull and menu, which its session-start ledger says. The next
   * run's start catches up, once, with the menu as the run's message; a try that fails is logged and made once more.
   */
  let startState: "done" | "due" | "running" = "due";
  let startFailures = 0;
  const catchUp = async (ctx: any): Promise<string | undefined> => {
    if (startState !== "due" || capability?.enabled !== true) return undefined;
    startState = "running";
    const session = ctx.sessionManager?.getSessionId?.();
    const held = store.heldTask();
    try {
      const home = freeflowHome();
      if (session && (await readStartLedger(home, session))?.steps.menu) {
        startState = "done";
        return undefined;
      }
      const text = await store.start(ctx.cwd, [ctx.cwd, dirname(ctx.cwd), packageRoot]);
      if (!store.current()) throw new Error("session status could not be read");
      if (session) await keepStartLedger(home, session).catch(() => {});
      events.freeflow("menu", "mid-session: sync, menu");
      startState = "done";
      if (store.heldTask() !== held) status(ctx);
      return text ? `${MID_SESSION}\n\nFreeflow task memory:\n${text}` : undefined;
    } catch (error) {
      startFailures += 1;
      events.freeflow("menu", `mid-session, menu failed: ${error instanceof Error ? error.message : String(error)}`);
      startState = startFailures < 2 ? "due" : "done";
      return undefined;
    }
  };
  /** `/freeflow capabilities`: Setup Freeflow's capabilities.mjs, the listing the agent reads too (section 4.6). */
  const capabilitiesText = async (): Promise<string> => {
    // The claims as they stand now, written before the script reads them.
    await events.writeClaims(claimInputs(), version);
    const ran = await new Promise<{ code: number; stdout: string; stderr: string }>((done) =>
      execFile(
        process.execPath,
        [
          join(packageRoot, "skills/setup-freeflow/scripts/capabilities.mjs"),
          "list",
          ...(events.sessionId() ? ["--session", events.sessionId()!] : []),
        ],
        { env: process.env, timeout: 8_000 },
        (error: any, stdout, stderr) =>
          done({ code: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr }),
      ),
    );
    return ran.code === 0
      ? ran.stdout.trimEnd()
      : `Freeflow capabilities: ${(ran.stderr.split("\n")[0] || `exit code ${ran.code}`).replace(/^Error: /, "")}`;
  };
  /** The store's line in /freeflow status: where it is and the task this session holds, as last read. */
  const storeStatusText = (): string | undefined => {
    const state = store.current();
    if (!state) return undefined;
    if (!state.store) return state.missing?.length ? `not ready (${state.missing[0].what})` : undefined;
    return `${state.home}${state.task ? `, holding ${state.task.id}` : ", no task held"}${state.changed ? ", changes not synced" : ""}`;
  };
  // Messaging between live Pi sessions (Task 002 D-005). Its tools are deferred: tool_search loads them.
  // Read from the event context that last synced messaging, while it was current: a captured context goes stale when
  // Pi replaces the session, so later asynchronous work uses these values, not the context.
  let messagingSeen: { sessionId: string; name?: string; cwd: string } | undefined;
  let agentRunning = false;
  const live = <T>(read: () => T, fallback: T): T => {
    try {
      return read();
    } catch {
      return fallback;
    }
  };
  const messaging = new Messaging(
    {
      identity: async () => {
        const seen = messagingSeen ?? { sessionId: `pid-${process.pid}`, cwd: process.cwd() };
        // The task this session holds in the Freeflow store, and its project, so another session can find it.
        const task = store.heldTask();
        const project = task && task.includes("/") ? task.split("/")[0] : undefined;
        return { ...seen, ...(project ? { project } : {}), ...(task ? { task } : {}) };
      },
      policy: () => capability?.messaging?.inbound ?? DEFAULT_INBOUND_POLICY,
      busy: () => agentRunning,
      deliver: (content, details) => {
        inbound.deliver({ customType: MESSAGE_TYPE, content, details, wake: true });
        if (!prompted && details.kind === "message")
          live(
            () =>
              liveHost?.ui?.notify?.(
                `A message from ${String(details.name ?? "another session")} is waiting: the agent reads it with your next prompt.`,
                "info",
              ),
            undefined,
          );
      },
      canWake: () => prompted,
      canAsk: () => live(() => liveHost?.hasUI === true, false),
      // The same dialog as ask_user, with a countdown (Task 002 D-008).
      confirm: async (title, message, timeout) =>
        (await Promise.resolve(
          live<Promise<boolean> | boolean>(
            () => confirmWithUser(liveHost, title, message, { timeoutMs: timeout, yes: "Deliver", no: "Refuse" }),
            false,
          ),
        ).catch(() => false)) === true,
    },
    freeflowHome(),
  );
  registerMessagingTools(api, messaging, messagingEffective);
  api.registerMessageRenderer?.(MESSAGE_TYPE, renderMessage);
  // Start or stop listening as messaging's effective state changes; a running session refreshes its registry entry.
  let messagingSync = Promise.resolve();
  function syncMessaging(ctx: any) {
    const effective = messagingEffective();
    if (effective)
      messagingSeen = live(() => {
        const manager = ctx.sessionManager;
        const name = manager?.getSessionName?.();
        return {
          sessionId: manager?.getSessionId?.() ?? `pid-${process.pid}`,
          ...(name ? { name } : {}),
          cwd: ctx.cwd ?? process.cwd(),
        };
      }, messagingSeen);
    messagingSync = messagingSync
      .then(() => (effective ? messaging.start() : messaging.running() ? messaging.stop() : undefined))
      .catch(() => {});
  }
  // The user's /freeflow compact asks the agent to checkpoint with --compact; Freeflow compacts when the run ends.
  async function compactNow(ctx: any) {
    if (!compactionEffective()) {
      ctx.ui.notify("Freeflow compaction is off; Pi's /compact still works.", "warning");
      return;
    }
    // Freeflow's message saying the user asked, not text in the user's name (Task 002 D-008); the run it starts keeps
    // Freeflow's system sections (host/section-keeper.ts).
    const text = freeflowNotice("compaction", USER_REQUEST);
    await Promise.resolve(
      api.sendMessage(
        { customType: COMPACT_REQUEST_TYPE, content: text, display: true, details: {} },
        { triggerTurn: true, deliverAs: "steer" },
      ),
    ).catch(() => {});
  }
  pi.on("resources_discover", async (event, ctx) => {
    const state = capability ?? (await loadSurface(ctx ?? { cwd: (event as any)?.cwd ?? process.cwd() }));
    return {
      // Only what this configuration can use (Task 003 D-002): capability skills only while their capability is
      // effective, and while Freeflow is inactive (disabled, or its prompts missing) only Setup Freeflow,
      // so /setup-freeflow still works.
      skillPaths:
        state?.enabled === true && hasUsableMandatoryPrompts(prompts)
          ? freeflowModelSkillPaths(state)
          : [freeflowSkillPath("setup-freeflow")],
    };
  });
  /** Sections recorded on another session or branch are not this one's; whether this branch had a prompt is its own. */
  const forgetSections = (ctx: any) => {
    ownSections = undefined;
    ownHead = undefined;
    ownSectionsVersion++;
    prompted = (cachedBranch(ctx.sessionManager) ?? []).some(
      (entry: any) =>
        entry?.type === "message" &&
        (entry.message?.role === "user" || (entry.message?.role === "system" && entry.message.sections)),
    );
  };
  pi.on("session_start", async (event, ctx) => {
    liveHost = ctx;
    // Sections recorded for another session (after /new or /resume) are not this one's.
    forgetSections(ctx);
    promptRun = false;
    messageRun = false;
    const generation = ++surfaceGeneration;
    resetHistory();
    // Where Pi has just parsed this session file, later checks read only the bytes appended since.
    trustStartedSession((event as any)?.reason, ctx.sessionManager);
    capability = undefined;
    prompts = undefined;
    refreshState = true;
    restoreSessionOverrides(ctx);
    await refreshRuntimeContext(STABLE_FREEFLOW_SURFACE);
    if (generation !== surfaceGeneration) return;
    await loadSurface(ctx);
    cacheHealth.reset();
    files.reset();
    stateSkills = [];
    compaction.reset();
    store.reset();
    waits.reset();
    // What Track Work's script reads about this session, for the agent's commands and Freeflow's own (T6).
    sessionEnvironment({
      id: ctx.sessionManager?.getSessionId?.(),
      file: ctx.sessionManager?.getSessionFile?.(),
      window: ctx.model?.contextWindow,
      notice: strictest([ctx.model], api.getSettings?.())?.notice,
    });
    events.begin(ctx.sessionManager?.getSessionId?.(), capability?.events?.enabled === true);
    // The gate state as it stands, read now; storeStart reads it again once session status has written it.
    gates.begin(ctx.sessionManager?.getSessionId?.());
    await gates.refresh();
    events.sessionStarted((event as any)?.reason, ctx.hasUI !== false);
    syncClaims();
    // A reload keeps the session, whose ledger says whether its start had the store's menu (SPEC-013).
    startState = capability?.enabled === true && (event as any)?.reason !== "reload" ? "done" : "due";
    startFailures = 0;
    if (capability?.enabled === true) void storeStart(ctx, (event as any)?.reason, generation);
    status(ctx);
  });
  pi.on("session_shutdown", async (event) => {
    surfaceGeneration++;
    // The session's last lines, before the release, whose summary counts them.
    events.sessionEnded((event as any)?.reason);
    await events.flush();
    // The hold is released as ended and the store pushed, before the next session's layer starts; a reload keeps it.
    await store.shutdown({ reload: (event as any)?.reason === "reload" }).catch(() => {});
    store.reset();
    waits.reset();
    // Leave the live registry and close the socket, after any start still queued; sessions waiting for this one learn
    // that it ended.
    messagingSync = messagingSync.then(() => messaging.stop()).catch(() => {});
    await messagingSync;
    // Background processes belong to this extension instance; none may report into the next session.
    await background.stopAll();
    inbound.reset();
    files.reset();
    stateSkills = [];
    compaction.reset();
    resetHistory();
    capability = undefined;
    prompts = undefined;
  });
  pi.on("before_agent_start", async (event, ctx) => {
    // Pi 1.2.0 and later fire this for a run an extension's message starts too (messageType "custom").
    const fromMessage = (event as any).messageType === "custom";
    runPrepared = true;
    await update(ctx);
    // The fixed guidance section and the staged settings: a missing section would change the cached prompt head.
    writeStagedSettings(ctx);
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
    // Nothing of Freeflow while it is disabled (Task 003 D-002); an absent config file leaves it on (D-045).
    if (capability?.enabled === true && hasUsableMandatoryPrompts(prompts))
      sections.freeflow_guidance = stableRuntimeContext(prompts, { prompts: capability?.prompts });
    if (toolExecution)
      Object.assign(sections, toolExecutionTail(api.getSettings?.()?.shellPath, prompts?.toolExecutionPrompt));
    // What Freeflow set, so requests of runs an extension's message starts keep it (host/section-keeper.ts).
    ownNames = OWN_SECTION_NAMES.filter(
      (name) => (toolExecution || (name !== "rules" && name !== "docs")) && typeof sections[name] === "string",
    );
    promptRun = !fromMessage;
    messageRun = fromMessage;
    prompted = true;
    // Freeflow arrived after this session's start: what its start would have given, as this run's message; a files
    // notice waits for the next run.
    const caught = startState === "due" ? await catchUp(ctx) : undefined;
    if (caught)
      return {
        message: { customType: STORE_TYPE, content: freeflowNotice("store", caught), display: true, details: {} },
      };
    // Like Claude Code's next-turn reminder: files the model read that changed while it was not running a tool.
    const changed = toolExecutionEffective() ? await files.changedNotice(ctx, false) : undefined;
    if (changed)
      return { message: { customType: "freeflow-files", content: freeflowNotice("files", changed), display: true } };
  });
  pi.on("agent_start", () => {
    waits.runStarted();
    events.runStarted();
    runUnprepared = !runPrepared;
    runPrepared = false;
    guidance.runStarted();
    agentRunning = true;
    if (messaging.running()) void messaging.setBusy(true).catch(() => {});
  });
  pi.on("message_end", async (event, ctx) => {
    const message = (event as any).message;
    if (message?.role === "assistant") events.modelRequest(message, ctx.thinkingLevel);
    if (
      capability?.enabled === true &&
      message?.role === "assistant" &&
      message.usage &&
      message.stopReason !== "error"
    ) {
      const lifetime = ctx.model?.promptCache?.[process.env.PI_CACHE_RETENTION === "long" ? "long" : "short"];
      const warning = cacheHealth.observe({
        provider: message.provider,
        model: message.model,
        thinking: ctx.thinkingLevel,
        at: Date.now(),
        input: message.usage.input ?? 0,
        cacheRead: message.usage.cacheRead ?? 0,
        cacheWrite: message.usage.cacheWrite ?? 0,
        ...(typeof lifetime === "number" ? { ttlMs: lifetime * 1000 } : {}),
      });
      if (warning) ctx.ui?.notify?.(warning, "warning");
    }
    // A run started by an extension's message (a background notice, for one) gets the same preparation as a prompt.
    // Pi 1.2.0 and later prepare it through before_agent_start; this covers earlier Pi, which skips that event there.
    // A retry's run starts with no message and is left as is.
    if (runUnprepared) {
      runUnprepared = false;
      if (message?.role === "custom") {
        await update(ctx);
        writeStagedSettings(ctx);
        status(ctx);
      }
    }
  });
  pi.on("tool_call", async (event, ctx) => {
    store.note(event.toolName, event.input, ctx.cwd);
    events.toolCall((event as any).toolCallId);
    // Before a checkpoint or a release runs, the lines so far are written, so the summary it commits counts them.
    if (
      event.toolName === "bash" &&
      /working-record\.mjs\s+(checkpoint|task\s+(release|switch))\b/.test(String((event.input as any)?.command ?? ""))
    )
      await events.flush();
    // The gates (SPEC-008 4.3), before Freeflow's other checks: warn adds a row to the result, block refuses, and a
    // delivery step under block asks the person where Pi has a screen.
    if (capability?.gates) {
      const gated = gates.check(event as any, ctx.cwd, capability.gates, ctx.hasUI === true);
      if (gates.missingOnce()) events.freeflow("gates", "no gate state for this session");
      for (const fired of gated.fired) events.emit("gate", gates.eventFields(fired, event.toolName));
      if (gated.kind === "block") return { block: true, reason: gated.reason };
      if (gated.kind === "ask") {
        const yes = await Promise.resolve(ctx.ui.confirm("Freeflow gate", gated.reason)).catch(() => false);
        if (!yes) return { block: true, reason: gated.reason };
      }
    }
    if (!toolExecutionEffective()) return undefined;
    const refusal = event.toolName === "bash" ? backgroundRefusal((event.input as any)?.command) : undefined;
    if (refusal) return { block: true, reason: refusal };
    return files.toolCall(event, ctx);
  });
  pi.on("tool_result", async (event, ctx) => {
    // Freeflow's own: a command that runs a script from Freeflow's package, or a file tool in the store (Part 8).
    const command = String((event.input as any)?.command ?? "");
    events.toolResult(
      event,
      ctx.cwd,
      (event.toolName === "bash" && command.includes(packageRoot)) ||
        touchesStore(event.toolName, event.input, ctx.cwd, store.current()?.home),
    );
    // After the agent ran Track Work's script, the held task may have changed: read it off the request path, for the
    // footer and the notice.
    if (event.toolName === "bash" && String((event.input as any)?.command ?? "").includes("working-record.mjs")) {
      // A lifecycle command may have written the gate state: read it again (one small file) before the next call.
      await gates.refresh();
      const held = store.heldTask();
      void store
        .refresh()
        .then(() => {
          if (store.heldTask() !== held) status(ctx);
        })
        .catch(() => {});
    }
    // The gates' warning rows for this call, once per gate per turn (SPEC-008 4.3).
    const gateRows = gates.takeRows((event as any).toolCallId);
    if (!toolExecutionEffective())
      return gateRows.length ? { content: withLines(event.content ?? [], gateRows) } : undefined;
    const shaped = await files.toolResult(event, ctx);
    // The push retriever's notice joins the result before it is delivered, after anything Tool Execution added.
    const executeWorkUnread = () =>
      !(capability?.skills?.off ?? []).includes("execute-work") && !files.loadedSkills(ctx).includes("execute-work");
    const lines = [
      ...(guidanceNoticesEffective() ? await guidance.toolResult(event, ctx.cwd, executeWorkUnread) : []),
      ...gateRows,
    ];
    return lines.length ? { content: withLines(shaped?.content ?? event.content ?? [], lines) } : shaped;
  });
  pi.on("turn_end", async (event, ctx) => {
    events.turnEnd((event.message as any)?.stopReason);
    files.clearPending();
    status(ctx);
    // The run's last turn, one with no tool calls: after a run that touched the store, the store is read again and
    // synced, and a checkpoint --compact that waits is answered by compacting with the bundle and continuing the run.
    const midRun = ((event.message as any)?.content ?? []).some((block: any) => block?.type === "toolCall");
    if (!midRun) {
      // The cycle a compaction now would end, read before the entry it writes is on the branch.
      const ended = compaction.cycleNow(ctx);
      const compacting = await compaction.settle(event, ctx);
      // After the store was read at the run's end: a delegation the Slice waits on that came back gives its row.
      if (!compacting && capability?.enabled === true) await waits.runEnded().catch(() => {});
      if (compacting) {
        if (compacting.entries.some((entry: any) => entry?.type === "compaction"))
          events.compaction("freeflow", undefined, ended);
        return compacting;
      }
    }
    const notice = compaction.observe(ctx, event);
    if (notice) {
      events.freeflow("notice", "notice", { context: notice.context, point: notice.point });
      // Mid-run the notice joins the next request; when the run is ending it waits for the next prompt rather than
      // starting work nobody asked for.
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
    events.turnStart();
    gates.turnStart();
    const compacted = compaction.takeCompacted();
    if (!compacted) return;
    // File state first, so the state restore refreshes lists no skill from before the compaction.
    await files.compacted(compacted.carriedFiles, ctx);
    await restore(ctx, false);
  });
  pi.on("agent_settled", async (_event, ctx) => {
    // The run's lines, written in one script run once the session stays idle: nothing waits on the log (T3).
    events.settled();
    promptRun = false;
    messageRun = false;
    agentRunning = false;
    if (messaging.running()) await messaging.setBusy(false).catch(() => {});
    await update(ctx);
  });
  // A model or effort picked in Pi itself (/model, Shift+Tab) starts a new back-to-back run for cache health.
  const externalChange = async (ctx: any) => {
    cacheHealth.noteSwitch();
    status(ctx);
  };
  pi.on("model_select", async (_event, ctx) => {
    if (ctx.model?.contextWindow) process.env.FREEFLOW_CONTEXT_WINDOW = String(ctx.model.contextWindow);
    const limits = strictest([ctx.model], api.getSettings?.());
    if (limits) process.env.FREEFLOW_NOTICE_POINT = String(limits.notice);
    await externalChange(ctx);
  });
  pi.on("thinking_level_select", async (_event, ctx) => externalChange(ctx));
  pi.on("context_with_system", async (event, ctx) => {
    writeStagedSettings(ctx);
    if (!capability) await loadSurface(ctx);
    // Entry identity lets attribution and request history skip hashing unchanged native history.
    tagProjectedMessages(
      event.messages,
      ctx.sessionManager?.buildSessionProjection?.(),
      cachedBranch(ctx.sessionManager) ?? [],
    );
    // A run an extension's message starts keeps the prompt of the last prompt's run: every section, as Pi rendered it,
    // so the sections other extensions set only for prompts (Pi's own MCP servers, for one) are not removed either; on
    // Pi 1.2.0 and later Freeflow's own follow what it set for that run. Recorded only while Freeflow sets sections;
    // with Freeflow off, Pi's prompt passes through unchanged.
    const strings = (current: Record<string, string | null>) =>
      Object.fromEntries(
        Object.entries(current).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
    if (promptRun) {
      const own = ownNames.length ? strings(currentSections(event.messages)) : {};
      if (
        !ownSections ||
        Object.keys(own).length !== Object.keys(ownSections).length ||
        Object.entries(own).some(([name, value]) => ownSections![name] !== value)
      ) {
        ownSections = own;
        ownSectionsVersion++;
      }
      ownHead = headSections(event.messages);
    } else if (messageRun && ownSections) {
      // Pi 1.2.0 and later give a run an extension's message starts the sections Freeflow set for it, so Freeflow's
      // follow this run, while every other section keeps the last prompt's value (its extension may set it only for
      // prompts). The head stays the one recorded, so a head Pi rebuilds here still gets the recorded sections.
      const current = currentSections(event.messages);
      const next: Record<string, string> = { ...ownSections };
      for (const name of OWN_SECTION_NAMES) {
        const value = current[name];
        if (typeof value === "string") next[name] = value;
        else delete next[name];
      }
      if (OWN_SECTION_NAMES.some((name) => next[name] !== ownSections![name])) {
        ownSections = next;
        ownSectionsVersion++;
      }
    } else if (!ownSections) {
      // A run Pi started before any prompt of this process (a resumed session messaged while idle): the transcript
      // still carries the last prompt's sections, when Freeflow's guidance is among them.
      const current = currentSections(event.messages);
      if (typeof current.freeflow_guidance === "string") {
        ownSections = strings(current);
        ownHead = headSections(event.messages);
        ownSectionsVersion++;
      }
    }
    let messages = keepSections(event.messages, ownSections, ownSectionsVersion, ownHead)
      .map(filterBootstrapMessage)
      .filter(Boolean);
    messages = withFreeflowRuntimeState(messages, capability, prompts, {
      force: refreshState,
      anchor: runtimeStateAnchor,
      skills: stateSkills,
    });
    refreshState = false;
    return { messages: await requestHistory.assemble(messages, ctx) };
  });
  const restore = async (ctx: any, navigation = true) => {
    cacheHealth.noteBreak();
    resetHistory();
    // Navigation selects another branch, whose reads differ; compaction keeps the branch and its file state.
    if (navigation) files.invalidate();
    restoreSessionOverrides(ctx);
    refreshState = true;
    await update(ctx);
  };
  pi.on("session_tree", async (_event, ctx) => {
    // A run Pi starts on this branch keeps this branch's last prompt's sections, not the branch left behind.
    forgetSections(ctx);
    await restore(ctx);
  });
  // Pi compacting on its own (threshold, overflow, /compact) keeps its summarizer and kept tail, with Freeflow's additions.
  pi.on("session_before_compact", async (event, ctx) => compaction.fallback(event, ctx));
  pi.on("session_compact", async (_event, ctx) => {
    // The entry this compaction wrote is on the branch now, so the cycle it ended is one before the branch's.
    events.compaction("harness", undefined, compaction.cycleNow(ctx) - 1);
    files.piCompacted();
    await restore(ctx, false);
    background.restate();
  });
  pi.on("session_compact_failed", async (_event, ctx) => {
    refreshState = true;
    status(ctx);
  });

  for (const { command, skill } of WORKFLOW_COMMANDS)
    pi.registerCommand(command, {
      description: command === skill ? `Run Freeflow ${skill}` : `Run Freeflow ${skill} via ${command}`,
      handler: (args, ctx) => sendSkillCommand(pi, ctx, skill, args),
    });
  for (const skill of CONTRIBUTOR_COMMANDS)
    pi.registerCommand(skill, {
      description: `Run Freeflow ${skill}`,
      handler: (args, ctx) => sendSkillCommand(pi, ctx, skill, args),
    });
  pi.registerCommand("freeflow", {
    description: "Freeflow settings, status, capabilities and compaction",
    getArgumentCompletions: (prefix) => freeflowCompletions(prefix),
    handler: async (args, ctx) => {
      if ((args ?? "").trim().toLowerCase() === "capabilities") {
        ctx.ui.notify(await capabilitiesText(), "info");
        return;
      }
      if ((args ?? "").trim().toLowerCase() === "compact") {
        await compactNow(ctx);
        return;
      }
      await handleFreeflowCommand(args, ctx, async () => update(ctx), pi, {
        status: () => ({
          cacheHealth: [...cacheHealth.status(), ...cacheMonitor.lines()],
          backgroundRunning: background.running().length,
          compaction: compaction.statusText(ctx),
          store: storeStatusText(),
          messaging: messaging.self()
            ? `this session is ${messaging.self()!.name}${messaging.heldCount() ? `, ${messaging.heldCount()} held` : ""}`
            : undefined,
        }),
      });
    },
  });
}
