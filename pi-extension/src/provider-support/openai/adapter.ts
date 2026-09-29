import type { CacheMonitor } from "../cache/monitor.js";
import { assemble, EFFORTS } from "./history.js";
import { SessionState } from "./session-state.js";

// Only these qualified official routes receive effort-history adaptation; keys isolate models.
const SUPPORTED_MODELS = new Set(["gpt-6-astra", "gpt-6-luna", "gpt-6-sol"]);

/** The effort-history key for a qualified official GPT-6 route, or undefined when the route is not supported. */
export function effortHistoryRoute(model: any): string | undefined {
  if (!model || !SUPPORTED_MODELS.has(model.id)) return;
  const codex = model.provider === "openai-codex" && model.api === "openai-codex-responses";
  const api = model.provider === "openai" && model.api === "openai-responses";
  if (!codex && !api) return;
  if (model.baseUrl !== undefined && typeof model.baseUrl !== "string") return;
  const base = (model.baseUrl ?? (codex ? "https://chatgpt.com/backend-api" : "https://api.openai.com/v1")).replace(
    /\/+$/,
    "",
  );
  const allowed = codex
    ? [
        "https://chatgpt.com/backend-api",
        "https://chatgpt.com/backend-api/codex",
        "https://chatgpt.com/backend-api/codex/responses",
      ]
    : ["https://api.openai.com/v1"];
  if (!allowed.includes(base)) return;
  return `${model.provider}/${model.api}/${model.id}`;
}

export function requestKey(payload: any, model: any): string | undefined {
  if (
    !payload ||
    !SUPPORTED_MODELS.has(payload.model) ||
    model?.id !== payload.model ||
    payload.store !== false ||
    !Array.isArray(payload.input) ||
    !EFFORTS.includes(payload.reasoning?.effort) ||
    payload.previous_response_id ||
    payload.conversation ||
    payload.context_management ||
    (payload.truncation && payload.truncation !== "disabled") ||
    (payload.reasoning.mode && payload.reasoning.mode !== "standard") ||
    payload.agents ||
    payload.input.some((x: any) => x?.type === "configuration_update" || x?.type === "compaction_trigger")
  )
    return;
  return effortHistoryRoute(model);
}
export class OpenAIEffortAdapter {
  private session?: { id: string; file?: string; store: SessionState };
  private generation = 0;
  private compacting = false;
  private queue: Promise<unknown> = Promise.resolve();
  private statusSignature?: string;
  constructor(
    private readonly pi: any,
    // Global Freeflow disablement leaves provider requests and session history untouched.
    private readonly enabled: () => boolean = () => true,
    private readonly monitor?: CacheMonitor,
  ) {}
  reset(ctx?: any): void {
    this.generation++;
    this.session = undefined;
    this.compacting = false;
    this.status(ctx, undefined);
  }
  setCompacting(value: boolean): void {
    this.compacting = value;
  }
  private status(_ctx: any, label: string | undefined): void {
    if (this.statusSignature === label) return;
    this.statusSignature = label;
    // A cache diagnostic, reported to /freeflow status rather than the settings footer.
    this.monitor?.set("openai-effort", label);
  }
  async adapt(payload: any, ctx: any): Promise<any> {
    const generation = this.generation;
    const operation = this.queue.then(async () => {
      const key = requestKey(payload, ctx.model);
      if (generation !== this.generation || this.compacting || !key || !this.enabled()) {
        this.status(ctx, undefined);
        return payload;
      }
      const label = ctx.model.id === "gpt-6-astra" ? "Astra" : ctx.model.id;
      try {
        const reader = ctx.sessionManager;
        if (
          typeof this.pi.appendEntry !== "function" ||
          !reader?.getLeafId ||
          !reader.getSessionId ||
          !reader.getSessionFile
        )
          throw new Error("Native session persistence unavailable");
        const id = reader.getSessionId(),
          file = reader.getSessionFile();
        if (!this.session || this.session.id !== id || this.session.file !== file)
          this.session = { id, file, store: new SessionState(this.pi, reader) };
        const store = this.session.store,
          basis = reader.getLeafId();
        const records = await store.records();
        if (
          generation !== this.generation ||
          reader.getLeafId() !== basis ||
          this.session?.store !== store ||
          key !== requestKey(payload, ctx.model)
        )
          throw new Error("OpenAI effort request changed during preparation");
        const result = assemble(payload, key, store.generation(), basis, records);
        if (result.record) store.append(result.record);
        this.status(ctx, `${label} ${result.effective} · cache baseline ${result.baseline}`);
        return result.payload;
      } catch {
        // Pi swallows hook exceptions. Return the untouched full-history request,
        // including its requested effort, instead of a partially pinned request.
        this.status(ctx, `${label} cache adaptation unavailable · native effort`);
        return payload;
      }
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
