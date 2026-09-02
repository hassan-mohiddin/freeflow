import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { readCapabilityState } from "../../runtime/runtime-context.js";
import { FileContextControlAuditSink } from "../persistence/audit.js";
import { FileContextControlJournal, MemoryContextControlJournal } from "../persistence/journal.js";
import { ContextControlRuntime } from "../core/runtime.js";
import { registerContextControlTools } from "../interfaces/tool.js";
import { repositoryIdentityForCwd } from "../core/source-registry.js";
import { sha256Text } from "../core/stable-json.js";
import {
  CONTEXT_CONTROL_RUNTIME_MODES,
  type ContextControlExtensionOptions,
  type ContextControlMode,
} from "../core/types.js";

export const CONTEXT_CONTROL_EXTENSION_VERSION = "0.2" as const;

export interface ContextControlResolvedConfig {
  enabled: boolean;
  cleanupMode: "model-only" | "model-approval" | "automatic";
  recoveryMode: "model-only" | "model-approval" | "automatic";
  recoveryScope: "active-branch" | "current-session" | "current-project";
}

export interface ContextControlExtensionState {
  version: typeof CONTEXT_CONTROL_EXTENSION_VERSION;
  mode: ContextControlMode;
  cleanupMode: "model-only" | "model-approval" | "automatic";
  recoveryMode: "model-only" | "model-approval" | "automatic";
  recoveryScope: "active-branch" | "current-session" | "current-project";
  enabled: boolean;
  runtime?: ContextControlRuntime;
  status():
    ReturnType<ContextControlRuntime["status"]> | { status: "unavailable"; operation: "status"; reason: string };
  list(): any;
  start(ctx: any): Promise<ContextControlRuntime | undefined>;
  reload(ctx: any): Promise<ContextControlRuntime | undefined>;
  purge(ctx?: any): Promise<{ status: "ok" | "unavailable"; operation: "purge"; reason?: string }>;
  restore(refs: unknown): Promise<any>;
  reset(): Promise<any>;
  shutdown(reason?: string): Promise<void>;
  invalidate(): void;
  beforeProviderRequest(): void;
  turnEnd(): void;
  settled(): void;
  setPrompt(prompt: unknown): void;
  project(
    messages: readonly any[],
    ctx: any,
  ): Promise<Awaited<ReturnType<ContextControlRuntime["project"]>> | undefined>;
  messageEnd(message: any): Promise<any>;
}

function validMode(value: unknown): ContextControlMode {
  if (typeof value === "string" && CONTEXT_CONTROL_RUNTIME_MODES.includes(value as ContextControlMode)) {
    return value as ContextControlMode;
  }
  throw new Error(`FREEFLOW_CONTEXT_CONTROL_EXPERIMENT must be one of: ${CONTEXT_CONTROL_RUNTIME_MODES.join(", ")}`);
}

function sidecarRoot(ctx: any, outputDir: string | undefined): string | undefined {
  if (outputDir) return resolve(outputDir);
  const repository = repositoryIdentityForCwd(typeof ctx?.cwd === "string" ? ctx.cwd : undefined);
  if (!repository) return undefined;
  return join(homedir(), ".freeflow", "context-control", "v1", "projects", sha256Text(repository).slice(0, 32));
}

function sessionSidecarRoot(ctx: any, root: string | undefined): string | undefined {
  if (root === undefined) return undefined;
  const sessionId = ctx?.sessionManager?.getSessionId?.();
  if (typeof sessionId !== "string" || sessionId.trim() === "") return undefined;
  return join(root, "sessions", sha256Text(sessionId.trim()).slice(0, 32));
}

function persistenceForContext(ctx: any, options: ContextControlExtensionOptions) {
  const root = sessionSidecarRoot(ctx, sidecarRoot(ctx, options.outputDir));
  const journal =
    options.journal ??
    (root === undefined
      ? new MemoryContextControlJournal()
      : new FileContextControlJournal(join(root, "journal.jsonl")));
  const audit =
    options.audit ?? (root === undefined ? undefined : new FileContextControlAuditSink(join(root, "audit.jsonl")));
  return { journal, audit };
}

async function configuredContextControl(ctx: any, pi: any): Promise<ContextControlResolvedConfig> {
  const state = await readCapabilityState(ctx?.cwd ?? process.cwd(), ctx, pi?.host);
  const configured = state?.contextControl;
  return {
    enabled: configured?.effective === true,
    cleanupMode:
      configured?.cleanupMode === "automatic" || configured?.cleanupMode === "model-approval"
        ? configured.cleanupMode
        : "model-only",
    recoveryMode:
      configured?.recoveryMode === "automatic" || configured?.recoveryMode === "model-approval"
        ? configured.recoveryMode
        : "model-only",
    recoveryScope:
      configured?.recoveryScope === "current-project" || configured?.recoveryScope === "current-session"
        ? configured.recoveryScope
        : "active-branch",
  };
}

export function createContextControlExtension(
  pi: any,
  options: ContextControlExtensionOptions & {
    resolveConfig?: (ctx: any) => Promise<ContextControlResolvedConfig>;
    registerLifecycle?: boolean;
  } = {},
): ContextControlExtensionState {
  const explicitMode = options.mode === undefined ? undefined : validMode(options.mode);
  let runtime: ContextControlRuntime | undefined;
  let config: ContextControlResolvedConfig = {
    enabled: explicitMode !== undefined && explicitMode !== "disabled",
    cleanupMode: options.cleanupMode ?? "model-only",
    recoveryMode: options.recoveryMode ?? "model-only",
    recoveryScope: options.recoveryScope ?? "active-branch",
  };

  const state: ContextControlExtensionState = {
    version: CONTEXT_CONTROL_EXTENSION_VERSION,
    mode: explicitMode ?? "disabled",
    cleanupMode: config.cleanupMode,
    recoveryMode: config.recoveryMode,
    recoveryScope: config.recoveryScope,
    enabled: config.enabled,
    get runtime() {
      return runtime;
    },
    start: async () => undefined,
    reload: async () => undefined,
    purge: async () => ({ status: "unavailable", operation: "purge", reason: "runtime-unbound" }),
    status: () => ({ status: "unavailable", operation: "status", reason: "runtime-unbound" }),
    list: () => ({ status: "unavailable", operation: "list", reason: "runtime-unbound", sources: [] }),
    restore: async () => ({ status: "unavailable", operation: "restore", changed: [], reason: "runtime-unbound" }),
    reset: async () => ({ status: "unavailable", operation: "reset", changed: [], reason: "runtime-unbound" }),
    shutdown: async () => undefined,
    invalidate: () => undefined,
    beforeProviderRequest: () => undefined,
    turnEnd: () => undefined,
    settled: () => undefined,
    setPrompt: () => undefined,
    project: async () => undefined,
    messageEnd: async () => undefined,
  };

  const bind = async (ctx: any): Promise<ContextControlRuntime | undefined> => {
    config = options.resolveConfig ? await options.resolveConfig(ctx) : config;
    const mode = explicitMode ?? (config.enabled ? "active" : "disabled");
    state.mode = mode;
    state.cleanupMode = config.cleanupMode;
    state.recoveryMode = config.recoveryMode;
    state.recoveryScope = config.recoveryScope;
    state.enabled = explicitMode === undefined ? config.enabled : mode !== "disabled";
    if (!state.enabled) {
      runtime = undefined;
      return undefined;
    }

    const { journal, audit } = persistenceForContext(ctx, options);
    runtime = new ContextControlRuntime({
      ctx,
      mode,
      cleanupMode: config.cleanupMode,
      recoveryMode: config.recoveryMode,
      recoveryScope: config.recoveryScope,
      journal,
      ...(audit === undefined ? {} : { audit }),
    });
    await runtime.start();
    return runtime;
  };

  state.start = async (ctx: any) => bind(ctx);
  state.reload = async (ctx: any) => {
    if (runtime !== undefined) await runtime.shutdown("configuration-reload");
    runtime = undefined;
    return bind(ctx);
  };
  state.purge = async (ctx?: any) => {
    if (runtime !== undefined) {
      const active = runtime;
      const result = await active.purge();
      runtime = undefined;
      return result;
    }
    if (ctx === undefined) return { status: "unavailable", operation: "purge", reason: "runtime-unbound" };
    const { journal, audit } = persistenceForContext(ctx, options);
    try {
      if (journal.purge === undefined) {
        return { status: "unavailable", operation: "purge", reason: "purge-unsupported" };
      }
      await journal.purge();
      await audit?.purge?.();
      return { status: "ok", operation: "purge" };
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).slice(0, 512);
      return { status: "unavailable", operation: "purge", reason };
    }
  };
  state.status = () => runtime?.status() ?? { status: "unavailable", operation: "status", reason: "runtime-unbound" };
  state.list = () =>
    runtime?.list() ?? { status: "unavailable", operation: "list", reason: "runtime-unbound", sources: [] };
  state.restore = async (refs: unknown) =>
    runtime?.restore(refs) ?? { status: "unavailable", operation: "restore", changed: [], reason: "runtime-unbound" };
  state.reset = async () =>
    runtime?.reset() ?? { status: "unavailable", operation: "reset", changed: [], reason: "runtime-unbound" };
  state.shutdown = async (reason = "unknown") => {
    if (runtime !== undefined) await runtime.shutdown(reason);
    runtime = undefined;
  };
  state.invalidate = () => runtime?.invalidate();
  state.beforeProviderRequest = () => runtime?.beforeProviderRequest();
  state.turnEnd = () => runtime?.turnEnd();
  state.settled = () => runtime?.settled();
  state.setPrompt = (prompt: unknown) => runtime?.setPrompt(prompt);
  state.project = async (messages: readonly any[], ctx: any) => {
    const active = runtime ?? (await bind(ctx));
    if (!active) return undefined;
    active.setContext(ctx);
    active.observeContext(messages);
    return active.project(messages);
  };
  state.messageEnd = async (message: any) => (runtime ? runtime.messageEnd(message) : undefined);

  registerContextControlTools(pi, () => runtime);

  if (options.registerLifecycle !== false) {
    pi.on("session_start", async (_event: unknown, ctx: any) => {
      await state.start(ctx);
    });

    pi.on("session_shutdown", async (event: any) => {
      await state.shutdown(typeof event?.reason === "string" ? event.reason : "unknown");
    });

    for (const eventName of [
      "session_before_switch",
      "session_before_fork",
      "session_before_compact",
      "session_tree",
      "session_compact",
    ]) {
      pi.on(eventName, async () => {
        state.invalidate();
      });
    }

    pi.on("before_agent_start", async (event: any) => {
      state.setPrompt(event?.prompt);
    });

    pi.on("context", async (event: any, ctx: any) => {
      const messages = Array.isArray(event?.messages) ? event.messages : [];
      const result = await state.project(messages, ctx);
      return result?.changed ? { messages: result.messages } : undefined;
    });

    pi.on("before_provider_request", async () => {
      state.beforeProviderRequest();
    });

    pi.on("turn_end", async () => {
      state.turnEnd();
    });

    pi.on("message_end", async (event: any) => state.messageEnd(event?.message));
    pi.on("agent_end", async () => undefined);
    pi.on("agent_settled", async () => state.settled());
  }

  return state;
}

export default function contextControlExtension(pi: any): ContextControlExtensionState {
  const modeValue = process.env.FREEFLOW_CONTEXT_CONTROL_EXPERIMENT;
  const outputDir = process.env.FREEFLOW_CONTEXT_CONTROL_OUTPUT_DIR;
  return createContextControlExtension(pi, {
    ...(modeValue === undefined ? {} : { mode: validMode(modeValue) }),
    ...(outputDir === undefined ? {} : { outputDir: resolve(outputDir) }),
    resolveConfig: (ctx) => configuredContextControl(ctx, pi),
  });
}
