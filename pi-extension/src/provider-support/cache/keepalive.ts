/** A model whose cached prompt must stay warm because its requester is certain to resume. */
export interface KeepAliveHold {
  provider: string;
  modelId: string;
  /** Who sent the request to keep warm, when several requesters share one model (such as routing profiles). */
  requester?: string;
}

export interface KeepAliveUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface KeepAliveOptions {
  enabled?: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void | Promise<void>, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  /** Sends the captured request unchanged apart from its output cap; resolves to its usage. */
  send?: (model: any, payload: any, ctx: any) => Promise<KeepAliveUsage | undefined>;
  env?: Record<string, string | undefined>;
  /** Longest a single hold keeps warming. */
  maxHoldMs?: number;
  /** Most a single hold may spend on refreshes, in the model's price units (USD). */
  maxHoldCost?: number;
  /** Receives each completed refresh so its usage and cost can be attributed. */
  onRefresh?: (record: KeepAliveRecord) => void;
}

export interface KeepAliveRecord {
  provider: string;
  model: string;
  usage: KeepAliveUsage;
  cost: number;
}

/**
 * Per-API replay details. APIs without an entry are never warmed: their output cannot be capped safely.
 * The ChatGPT Codex backend rejects max_output_tokens and prompt_cache_options, so it has no entry.
 */
interface ReplayProtocol {
  cap(payload: any): any;
  retention(payload: any): "short" | "long" | undefined;
  /** Whether capping the output leaves the cached prompt and the work unchanged; always when absent. */
  replayable?(payload: any): boolean;
}
const responses: ReplayProtocol = {
  cap: (payload) => ({ ...payload, max_output_tokens: 16 }),
  retention: (payload) =>
    payload?.prompt_cache_retention === "24h" || payload?.prompt_cache_options?.ttl ? "long" : undefined,
};
const PROTOCOLS: Record<string, ReplayProtocol> = {
  "anthropic-messages": {
    cap: (payload) => ({ ...payload, max_tokens: 1 }),
    retention: (payload) => (JSON.stringify(payload).includes('"ttl":"1h"') ? "long" : "short"),
    // Budget-based thinking must stay below max_tokens and is part of the cache key, so a one-token replay is
    // rejected or writes a different entry. Adaptive thinking has no budget. Pi's own warmer skips these too.
    replayable: (payload) => payload?.thinking?.type !== "enabled",
  },
  "openai-responses": responses,
  "azure-openai-responses": responses,
};

/** Continuation is near-certain while a delegated worker runs: the requester resumes on its return. */
const CONTINUATION = 0.9;
/** Same threshold as Pi's own warmer: a refresh must be expected to save at least this much. */
const MINIMUM_SAVINGS = 0.05;
/** A refresh counts as reuse only when it reads nearly all of the prompt. */
const REUSE = 0.9;
const EXPIRY_MARGIN_MS = 10_000;

interface Lane {
  key: string;
  model: any;
  payload: any;
  sentAt: number;
  prompt?: number;
}

/**
 * Keeps a suspended requester's prompt cache warm while it is certain to resume, such as a Coordinator
 * whose delegated worker is still running. Pi's own warmer only keeps the latest request warm, which
 * during a worker run belongs to the worker. Eligibility and economics come from the model's declared
 * cache lifetime and prices, so any provider that declares them is handled the same way.
 */
export class CacheKeepAlive {
  private lanes = new Map<string, Lane>();
  private holdSource: () => KeepAliveHold | undefined = () => undefined;
  private requester: () => string | undefined = () => undefined;
  private active?: { lane: string; since: number; spent: number; timer?: unknown; ctx: any };
  private lastStop?: string;
  private readonly now: () => number;
  private readonly setTimer: NonNullable<KeepAliveOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<KeepAliveOptions["clearTimer"]>;
  private readonly send: NonNullable<KeepAliveOptions["send"]>;

  constructor(private readonly options: KeepAliveOptions = {}) {
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms).unref?.());
    this.clearTimer = options.clearTimer ?? ((timer: any) => clearTimeout(timer));
    this.send = options.send ?? sendThroughHost;
  }

  setHoldSource(source: () => KeepAliveHold | undefined): void {
    this.holdSource = source;
  }

  /** Names who is sending the current request, so requesters sharing a model keep separate lanes. */
  setRequesterSource(source: () => string | undefined): void {
    this.requester = () => {
      try {
        return source();
      } catch {
        return undefined;
      }
    };
  }

  reset(): void {
    this.stop("reset");
    this.lanes.clear();
  }

  status(): string | undefined {
    if (this.active)
      return `Keeping ${this.lanes.get(this.active.lane)?.model?.id} cache warm while its worker runs · $${this.active.spent.toFixed(3)} spent`;
    return this.lastStop;
  }

  /** Remember the request just sent on its model; a hold keeps the latest one warm. */
  record(payload: any, ctx: any): void {
    const key = laneKey(ctx, undefined, this.requester());
    const protocol = PROTOCOLS[ctx.model?.api];
    if (!key || !protocol) return;
    if (protocol.replayable?.(payload) === false) {
      this.lanes.delete(key);
      if (this.active?.lane === key) this.stop("this request cannot be replayed with a capped output");
      return;
    }
    const prior = this.lanes.get(key);
    this.lanes.set(key, { key, model: ctx.model, payload, sentAt: this.now(), prompt: prior?.prompt });
    if (this.active?.lane === key) this.schedule();
  }

  /** Provider-reported usage of the latest request on a model gives the prompt size to price. */
  observe(ctx: any, usage: KeepAliveUsage | undefined, producer?: KeepAliveHold): void {
    const lane = this.lanes.get(laneKey(ctx, producer, this.requester()) ?? "");
    if (lane && usage) lane.prompt = usage.input + usage.cacheRead + usage.cacheWrite;
  }

  /** Start or stop holding according to the current run and hold source. */
  evaluate(ctx: any): void {
    const hold = this.currentHold(ctx);
    const key = hold && laneKey(ctx, hold, hold.requester);
    if (this.active && this.active.lane === key) {
      this.active.ctx = ctx;
      return;
    }
    this.stop(hold ? "hold changed" : "no suspended requester");
    if (!key || !this.lanes.has(key)) return;
    this.active = { lane: key, since: this.now(), spent: 0, ctx };
    this.schedule();
  }

  private currentHold(ctx: any): KeepAliveHold | undefined {
    if (!(this.options.enabled?.() ?? true) || ctx?.isIdle?.() !== false) return;
    try {
      return this.holdSource();
    } catch {
      return;
    }
  }

  private stop(reason: string): void {
    if (this.active?.timer !== undefined) this.clearTimer(this.active.timer);
    if (this.active) this.lastStop = `Cache keep-alive stopped: ${reason}`;
    this.active = undefined;
  }

  private ttlMs(lane: Lane): number | undefined {
    const protocol = PROTOCOLS[lane.model.api];
    const env = this.options.env ?? process.env;
    const retention = protocol?.retention(lane.payload) ?? (env.PI_CACHE_RETENTION === "long" ? "long" : "short");
    const seconds = lane.model.promptCache?.[retention];
    return typeof seconds === "number" && seconds > 0 ? seconds * 1000 : undefined;
  }

  private schedule(): void {
    const active = this.active;
    if (!active) return;
    if (active.timer !== undefined) this.clearTimer(active.timer);
    active.timer = undefined;
    const lane = this.lanes.get(active.lane)!;
    const ttl = this.ttlMs(lane);
    if (!ttl || ttl <= EXPIRY_MARGIN_MS) return this.stop("model declares no cache lifetime");
    const at = lane.sentAt + refreshDelay(ttl);
    active.timer = this.setTimer(() => this.refresh(active), Math.max(0, at - this.now()));
  }

  private async refresh(active: NonNullable<CacheKeepAlive["active"]>): Promise<void> {
    if (this.active !== active) return;
    active.timer = undefined;
    const lane = this.lanes.get(active.lane)!;
    const hold = this.currentHold(active.ctx);
    if (!hold || laneKey(active.ctx, hold, hold.requester) !== active.lane)
      return this.stop("requester resumed or run ended");
    const now = this.now();
    // Like Pi's warmer, a refresh later than halfway from its slot to expiry is likely a full rewrite.
    const ttl = this.ttlMs(lane)!,
      delay = refreshDelay(ttl);
    if (now > lane.sentAt + delay + (ttl - delay) / 2) return this.stop("cache entry already expired");
    if (now - active.since > (this.options.maxHoldMs ?? 6 * 3_600_000)) return this.stop("hold duration limit");
    const economics = price(lane);
    if (!economics) return this.stop("prompt size or prices unknown");
    if (CONTINUATION * economics.miss - economics.warm < MINIMUM_SAVINGS)
      return this.stop("refresh would not save money");
    if (active.spent + economics.warm > (this.options.maxHoldCost ?? 2)) return this.stop("hold spend limit");
    let usage: KeepAliveUsage | undefined;
    try {
      usage = await this.send(lane.model, PROTOCOLS[lane.model.api].cap(lane.payload), active.ctx);
    } catch {
      usage = undefined;
    }
    if (this.active !== active) return;
    if (!usage) return this.stop("refresh failed");
    const spent = cost(lane.model, usage);
    active.spent += spent;
    try {
      this.options.onRefresh?.({ provider: lane.model.provider, model: lane.model.id, usage, cost: spent });
    } catch {
      // Attribution is diagnostic and never changes warming.
    }
    if (usage.cacheRead < REUSE * lane.prompt! || usage.cacheWrite > (1 - REUSE) * lane.prompt!)
      return this.stop("refresh did not reuse the cache");
    lane.sentAt = now;
    this.schedule();
  }
}

/** Pi's refresh point: 90% of the lifetime, keeping at least ten seconds of margin. */
const refreshDelay = (ttl: number) => Math.min(ttl * 0.9, ttl - EXPIRY_MARGIN_MS);

function laneKey(ctx: any, hold?: KeepAliveHold, requester?: string): string | undefined {
  const provider = hold?.provider ?? ctx?.model?.provider,
    model = hold?.modelId ?? ctx?.model?.id;
  if (!provider || !model) return;
  return JSON.stringify([ctx?.sessionManager?.getSessionId?.() ?? "memory", provider, model, requester ?? ""]);
}

const perToken = (value: unknown) => (typeof value === "number" ? value / 1_000_000 : undefined);

function price(lane: Lane): { warm: number; miss: number } | undefined {
  const c = lane.model.cost ?? {};
  const read = perToken(c.cacheRead),
    input = perToken(c.input),
    output = perToken(c.output) ?? 0;
  const write = perToken(c.cacheWrite) || input;
  if (!lane.prompt || read === undefined || write === undefined) return;
  return { warm: lane.prompt * read + output, miss: Math.max(0, lane.prompt * (write - read)) };
}

function cost(model: any, usage: KeepAliveUsage): number {
  const c = model.cost ?? {};
  return (
    usage.input * (perToken(c.input) ?? 0) +
    usage.output * (perToken(c.output) ?? 0) +
    usage.cacheRead * (perToken(c.cacheRead) ?? 0) +
    usage.cacheWrite * (perToken(c.cacheWrite) ?? 0)
  );
}

/** Replay through the host's own transport so provider auth and request shaping apply as usual. */
async function sendThroughHost(model: any, payload: any, ctx: any): Promise<KeepAliveUsage | undefined> {
  const stream = ctx.modelRegistry.streamSimple(
    model,
    { systemPrompt: "", messages: [{ role: "user", content: "cache keep-alive", timestamp: Date.now() }] },
    { onPayload: () => payload, maxRetries: 0, maxTokens: 1 },
  );
  const message = await stream.result();
  return message.stopReason === "error" || message.stopReason === "aborted" ? undefined : message.usage;
}
