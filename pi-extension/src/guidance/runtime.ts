import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { isStoreIdentifier, type SessionStore, type StoreEvent, type StoreFence } from "../session-store/contracts.js";
import type { Json } from "../tool-runtime/contracts.js";
import { jsonDigest } from "../tool-runtime/schema.js";

const GUIDANCE_ID = "tool-execution";
const MAX_SKILL_BYTES = 50 * 1024;

type Binding = Readonly<{
  store: SessionStore & { replayGuidanceForSession?(sessionId: string): Promise<readonly StoreEvent<"guidance">[]> };
  fence: StoreFence;
}>;
type Introduction = Readonly<{
  kind: "introduced";
  occurrenceId: string;
  nativeEntryId: string;
  toolCallId: string;
  contentHash: string;
  revision: string;
}>;
type Delivery = Readonly<{
  kind: "delivered";
  occurrenceId: string;
  nativeEntryId: string;
  introductionEntryId: string;
  requestId: string;
  contentHash: string;
  revision: string;
}>;
type Fact = Introduction | Delivery;
type GuidanceStatus = Readonly<{
  state: "absent" | "unobserved" | "introduced" | "delivered" | "outdated";
  revision?: string;
  occurrenceId?: string;
  boundary?: string;
}>;
type PendingRead = Readonly<{ toolCallId: string; sessionId: string; body: string; contentHash: string }>;
type PendingRequest = Readonly<{
  id: string;
  fact: Introduction;
  sessionId: string;
  before: ReadonlySet<string>;
}>;

function hash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function entries(ctx: any): any[] {
  const branch = ctx?.sessionManager?.getBranch?.();
  return Array.isArray(branch) ? branch : [];
}

function sessionId(ctx: any): string | undefined {
  const value = ctx?.sessionManager?.getSessionId?.();
  return typeof value === "string" && isStoreIdentifier(value) ? value : undefined;
}

function textBody(content: unknown): string | undefined {
  if (!Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text") return undefined;
  return typeof content[0].text === "string" ? content[0].text : undefined;
}

function serialized(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function applicableRead(fact: Introduction, branch: any[], ctx: any): boolean {
  const projected = ctx?.sessionManager?.buildSessionProjection?.()?.messages;
  if (
    Array.isArray(projected) &&
    !projected.some(
      (message: any) =>
        message?.role === "toolResult" &&
        message.toolName === "read" &&
        message.toolCallId === fact.toolCallId &&
        typeof textBody(message.content) === "string" &&
        hash(textBody(message.content)!) === fact.contentHash,
    )
  )
    return false;
  if (branch.some((entry) => entry?.type === "context_edit" && entry.targetId === fact.nativeEntryId)) return false;
  const native = branch.filter((entry) => entry?.id === fact.nativeEntryId);
  return (
    native.length === 1 &&
    native[0].type === "message" &&
    native[0].message?.role === "toolResult" &&
    native[0].message.toolName === "read" &&
    native[0].message.toolCallId === fact.toolCallId &&
    !native[0].message.isError &&
    typeof textBody(native[0].message.content) === "string" &&
    hash(textBody(native[0].message.content)!) === fact.contentHash
  );
}

function isFact(event: StoreEvent): Fact | undefined {
  if (event.domain !== "guidance" || event.operationId !== GUIDANCE_ID || !event.nativeEntryId) return undefined;
  const payload = event.payload as Record<string, unknown>;
  if (
    payload?.guidanceId !== GUIDANCE_ID ||
    typeof payload.occurrenceId !== "string" ||
    !isStoreIdentifier(payload.occurrenceId) ||
    typeof payload.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.contentHash) ||
    payload.revision !== `sha256:${payload.contentHash}`
  )
    return undefined;
  const common = {
    occurrenceId: payload.occurrenceId,
    nativeEntryId: event.nativeEntryId,
    contentHash: payload.contentHash,
    revision: payload.revision,
  };
  if (event.kind === "skill-introduced" && typeof payload.toolCallId === "string")
    return { kind: "introduced", ...common, toolCallId: payload.toolCallId };
  if (
    event.kind === "skill-delivered" &&
    typeof payload.introductionEntryId === "string" &&
    typeof payload.requestId === "string" &&
    isStoreIdentifier(payload.introductionEntryId) &&
    isStoreIdentifier(payload.requestId)
  )
    return {
      kind: "delivered",
      ...common,
      introductionEntryId: payload.introductionEntryId,
      requestId: payload.requestId,
    };
  return undefined;
}

// Staged independently of normal root store activation; P5 binds this to the owning Session Store.
export class GuidanceRuntime {
  private body?: string;
  private contentHash?: string;
  private observationAvailable = false;
  private cached?: { sessionId: string | undefined; leafId: string | null; value: GuidanceStatus };
  private readonly reads = new Map<string, PendingRead>();
  private readonly facts: Fact[] = [];
  private readonly requests: PendingRequest[] = [];

  constructor(
    private readonly skillPath: string,
    private readonly binding: () => Binding | undefined,
  ) {}

  async refresh(ctx: any): Promise<void> {
    this.reads.clear();
    this.requests.length = 0;
    this.facts.length = 0;
    this.body = undefined;
    this.contentHash = undefined;
    this.observationAvailable = false;
    this.cached = undefined;
    try {
      const body = await readFile(this.skillPath, "utf8");
      if (!body.trim() || Buffer.byteLength(body, "utf8") > MAX_SKILL_BYTES || body.split("\n").length > 2000) return;
      this.body = body;
      this.contentHash = hash(body);
    } catch {
      return;
    }
    const bound = this.binding();
    const id = sessionId(ctx);
    if (!bound || !id || bound.fence.sessionId !== id) return;
    try {
      const replayed = bound.store.replayGuidanceForSession
        ? await bound.store.replayGuidanceForSession(id)
        : await bound.store.replay("guidance", {
            sessionId: id,
            branchAnchor: bound.fence.branchAnchor,
            nativeEntryIds: entries(ctx)
              .map((entry) => entry.id)
              .filter(isStoreIdentifier),
          });
      this.facts.push(
        ...replayed.flatMap((event) => {
          const fact = isFact(event);
          return fact ? [fact] : [];
        }),
      );
      this.observationAvailable = true;
    } catch {
      // Unavailable replay cannot be promoted into an introduction or delivery claim.
    }
  }

  // Tree and compaction change applicability, not the acknowledged event set. No store I/O here.
  ancestryChanged(): void {
    this.reads.clear();
    this.requests.length = 0;
    this.cached = undefined;
  }

  needsPublication(): boolean {
    return this.reads.size > 0 || this.requests.length > 0;
  }

  observeRead(event: any, ctx: any): void {
    if (
      event?.toolName !== "read" ||
      event.isError ||
      typeof event.input?.path !== "string" ||
      (isAbsolute(event.input.path) ? event.input.path : resolve(ctx?.cwd ?? "", event.input.path)) !==
        this.skillPath ||
      event.input.offset !== undefined ||
      event.input.limit !== undefined ||
      event.details?.truncation ||
      typeof event.toolCallId !== "string" ||
      !this.body ||
      !this.contentHash
    )
      return;
    if (textBody(event.content) !== this.body) return;
    const id = sessionId(ctx);
    if (id)
      this.reads.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        sessionId: id,
        body: this.body,
        contentHash: this.contentHash,
      });
  }

  // Only a qualified final observer can assert body presence at the local request boundary.
  // The generic Pi hook alone cannot prove no later extension changed the payload.
  observePrepared(payload: any, ctx: any, finalAtObserver = false): void {
    const id = sessionId(ctx);
    if (!finalAtObserver || !this.body || !this.contentHash || !id) return;
    const branch = entries(ctx);
    const candidates = this.facts.filter(
      (fact): fact is Introduction =>
        fact.kind === "introduced" && fact.contentHash === this.contentHash && applicableRead(fact, branch, ctx),
    );
    const input = Array.isArray(payload?.input) ? payload.input : [];
    const matched = candidates.filter((fact) =>
      input.some(
        (item: any) =>
          item?.type === "function_call_output" &&
          item.call_id === fact.toolCallId.split("|")[0] &&
          item.output === this.body,
      ),
    );
    if (matched.length !== 1) return;
    this.requests.push({
      id: `request:${randomUUID()}`,
      fact: matched[0]!,
      sessionId: id,
      before: new Set(branch.map((entry) => entry?.id).filter(isStoreIdentifier)),
    });
  }

  private async append(kind: StoreEvent<"guidance">["kind"], nativeEntryId: string, payload: Json): Promise<boolean> {
    const bound = this.binding();
    if (!bound) {
      this.observationAvailable = false;
      this.cached = undefined;
      return false;
    }
    const event: StoreEvent<"guidance"> = {
      version: 1,
      id: `event:${randomUUID()}`,
      domain: "guidance",
      kind,
      operationId: GUIDANCE_ID,
      recordedSessionId: bound.fence.sessionId,
      branchAnchor: bound.fence.branchAnchor,
      nativeEntryId,
      payload,
      artifactRefs: [],
      payloadHash: jsonDigest(payload),
    };
    try {
      await bound.store.appendEvent(event, bound.fence);
      return true;
    } catch {
      this.observationAvailable = false;
      this.cached = undefined;
      return false;
    }
  }

  async turnEnd(event: any, ctx: any): Promise<void> {
    const id = sessionId(ctx);
    const branch = entries(ctx);
    const candidates = new Map(this.reads);
    this.reads.clear();
    if (id) {
      for (const result of Array.isArray(event?.toolResults) ? event.toolResults : []) {
        const pending = candidates.get(result?.toolCallId);
        if (
          !pending ||
          pending.sessionId !== id ||
          result.toolName !== "read" ||
          result.isError ||
          textBody(result.content) !== pending.body
        )
          continue;
        const native = branch.filter(
          (entry) =>
            entry?.type === "message" &&
            entry.message?.role === "toolResult" &&
            entry.message.toolName === "read" &&
            entry.message.toolCallId === pending.toolCallId &&
            textBody(entry.message.content) === pending.body &&
            !entry.message.isError &&
            isStoreIdentifier(entry.id),
        );
        if (native.length !== 1) continue;
        const fact: Introduction = {
          kind: "introduced",
          occurrenceId: `occurrence:${randomUUID()}`,
          nativeEntryId: native[0]!.id,
          toolCallId: pending.toolCallId,
          contentHash: pending.contentHash,
          revision: `sha256:${pending.contentHash}`,
        };
        if (
          await this.append("skill-introduced", fact.nativeEntryId, {
            guidanceId: GUIDANCE_ID,
            occurrenceId: fact.occurrenceId,
            toolCallId: fact.toolCallId,
            contentHash: fact.contentHash,
            revision: fact.revision,
          })
        ) {
          this.facts.push(fact);
          this.cached = undefined;
        }
      }
    }
    const attempts = this.requests.splice(0);
    const attempt = attempts.length === 1 ? attempts[0] : undefined;
    const message = event?.message;
    if (
      !attempt ||
      !id ||
      attempt.sessionId !== id ||
      message?.role !== "assistant" ||
      !["stop", "toolUse"].includes(message.stopReason) ||
      !branch.some((entry) => entry.id === attempt.fact.nativeEntryId)
    )
      return;
    const messageText = serialized(message);
    if (messageText === undefined) return;
    const native = branch.filter(
      (entry) =>
        !attempt.before.has(entry?.id) &&
        entry?.type === "message" &&
        entry.message?.role === "assistant" &&
        isStoreIdentifier(entry.id) &&
        serialized(entry.message) === messageText,
    );
    if (native.length !== 1) return;
    const fact: Delivery = {
      kind: "delivered",
      occurrenceId: attempt.fact.occurrenceId,
      nativeEntryId: native[0]!.id,
      introductionEntryId: attempt.fact.nativeEntryId,
      requestId: attempt.id,
      contentHash: attempt.fact.contentHash,
      revision: attempt.fact.revision,
    };
    if (
      await this.append("skill-delivered", fact.nativeEntryId, {
        guidanceId: GUIDANCE_ID,
        occurrenceId: fact.occurrenceId,
        introductionEntryId: fact.introductionEntryId,
        requestId: fact.requestId,
        contentHash: fact.contentHash,
        revision: fact.revision,
      })
    ) {
      this.facts.push(fact);
      this.cached = undefined;
    }
  }

  private computeStatus(ctx: any): GuidanceStatus {
    if (!this.observationAvailable) return { state: "unobserved" };
    const branch = entries(ctx);
    const reachable = new Set(branch.map((entry) => entry?.id));
    const introductions = this.facts.filter(
      (fact): fact is Introduction => fact.kind === "introduced" && applicableRead(fact, branch, ctx),
    );
    const current = introductions.at(-1);
    if (!current) return { state: "absent" };
    if (current.contentHash !== this.contentHash) return { state: "outdated", revision: current.revision };
    const delivery = this.facts
      .filter(
        (fact) =>
          fact.kind === "delivered" &&
          fact.occurrenceId === current.occurrenceId &&
          fact.introductionEntryId === current.nativeEntryId &&
          reachable.has(fact.nativeEntryId),
      )
      .at(-1);
    return {
      state: delivery ? "delivered" : "introduced",
      revision: current.revision,
      occurrenceId: current.occurrenceId,
      ...(delivery ? { boundary: "completed-local-request-observation" } : {}),
    };
  }

  status(ctx: any): GuidanceStatus {
    if (!this.observationAvailable) return { state: "unobserved" };
    const manager = ctx?.sessionManager;
    if (typeof manager?.getLeafId !== "function" || typeof manager?.getEntry !== "function")
      return this.computeStatus(ctx); // Narrow test hosts may not expose native entry identity.
    const leafId = manager.getLeafId() ?? null;
    const id = sessionId(ctx);
    const cached = this.cached;
    if (cached && cached.sessionId === id) {
      if (cached.leafId === leafId) return cached.value;
      let cursor = leafId;
      let inspected = 0;
      while (cursor !== cached.leafId && cursor !== null && inspected++ < 64) {
        const entry = manager.getEntry(cursor);
        if (!entry || entry.type === "compaction") return { state: "unobserved" };
        if (
          entry.type === "context_edit" &&
          this.facts.some((fact) => fact.kind === "introduced" && fact.nativeEntryId === entry.targetId)
        )
          return { state: "unobserved" };
        cursor = entry.parentId ?? null;
      }
      if (cursor !== cached.leafId) return { state: "unobserved" };
      cached.leafId = leafId;
      return cached.value;
    }
    const value = this.computeStatus(ctx);
    this.cached = { sessionId: id, leafId, value };
    return value;
  }
}
