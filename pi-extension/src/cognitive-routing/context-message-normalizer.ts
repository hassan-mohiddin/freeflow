import { isDeepStrictEqual } from "node:util";

import { contextRefForEntry, type ContextSourceIdentity } from "../freeflow-context/types.js";

export type ContextMessageReplayability = "eligible" | "quarantined";

export type NormalizableContextSource = {
  source: ContextSourceIdentity;
  message: any;
  kind: "user" | "assistant" | "toolResult" | "summary" | "custom";
  replayability?: ContextMessageReplayability;
  quarantineReason?: string;
};

export type ContextMessageQuarantine = {
  position: number;
  reason: string;
  role?: string;
  customType?: string;
  ref?: string;
};

export type NormalizedContextMessage<TSource extends NormalizableContextSource = NormalizableContextSource> = {
  position: number;
  message: any;
  disposition: "eligible" | "quarantined";
  source?: TSource;
  ref?: string;
  reason?: string;
  ownedTransient?: boolean;
};

export type ContextMessageNormalization<TSource extends NormalizableContextSource = NormalizableContextSource> = {
  items: NormalizedContextMessage<TSource>[];
  quarantines: ContextMessageQuarantine[];
};

export function contextMessageRole(message: any): string | undefined {
  return typeof message?.role === "string" ? message.role : undefined;
}

function customMessageShape(message: any): any {
  if (!message || typeof message !== "object") return message;
  const comparable = { ...message };
  delete comparable.timestamp;
  return comparable;
}

function customMessageTimestamp(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function contextMessageMatchesSource(message: any, source: NormalizableContextSource): boolean {
  if (source.message === undefined) return false;
  if (source.kind === "custom" || message?.role === "custom" || source.message?.role === "custom") {
    return (
      source.message?.role === "custom" &&
      message?.role === "custom" &&
      customMessageTimestamp(source.message.timestamp) &&
      customMessageTimestamp(message.timestamp) &&
      isDeepStrictEqual(customMessageShape(source.message), customMessageShape(message))
    );
  }
  return source.message === message || isDeepStrictEqual(source.message, message);
}

function structuralQuarantineReason(message: any): string | undefined {
  const role = contextMessageRole(message);
  if (!role) return "message_role_unavailable";
  if (role === "user") return undefined;
  if (role === "custom") {
    if (typeof message.customType !== "string" || message.customType.length === 0) return "custom_type_invalid";
    if (typeof message.content !== "string" && !Array.isArray(message.content)) return "custom_content_invalid";
    return undefined;
  }
  if (role === "branchSummary" || role === "compactionSummary") return undefined;
  if (role === "toolResult") {
    if (typeof message.toolCallId !== "string" || message.toolCallId.length === 0) {
      return "tool_result_call_id_invalid";
    }
    if (typeof message.toolName !== "string" || message.toolName.length === 0) return "tool_result_name_invalid";
    if (!Array.isArray(message.content)) return "tool_result_content_invalid";
    return undefined;
  }
  if (role !== "assistant") return `message_role_unsupported:${role}`;
  if (!Array.isArray(message.content)) return "assistant_content_invalid";

  const terminal = message.stopReason;
  if (terminal === "error" || terminal === "aborted" || terminal === "deferred" || terminal === "pending") {
    return `assistant_terminal_${terminal}`;
  }
  if (
    terminal !== undefined &&
    terminal !== "stop" &&
    terminal !== "toolUse" &&
    terminal !== "length"
  ) {
    return "assistant_stop_reason_unsupported";
  }

  const callIds = new Set<string>();
  for (const part of message.content) {
    if (part?.type !== "toolCall") continue;
    if (typeof part.id !== "string" || part.id.length === 0) return "assistant_tool_call_id_invalid";
    if (typeof part.name !== "string" || part.name.length === 0) return "assistant_tool_call_name_invalid";
    if (callIds.has(part.id)) return "assistant_tool_call_ids_ambiguous";
    callIds.add(part.id);
  }
  return undefined;
}

function quarantineFor(
  position: number,
  message: any,
  reason: string,
  source?: NormalizableContextSource,
): ContextMessageQuarantine {
  const role = contextMessageRole(message);
  const entryId = source?.source?.entryId;
  return {
    position,
    reason,
    ...(role ? { role } : {}),
    ...(typeof message?.customType === "string" ? { customType: message.customType } : {}),
    ...(typeof entryId === "string" ? { ref: contextRefForEntry(entryId) } : {}),
  };
}

export function normalizeContextMessages<TSource extends NormalizableContextSource>(input: {
  messages: readonly any[];
  sources: readonly TSource[];
  ownedTransientMessages?: readonly any[];
}): ContextMessageNormalization<TSource> {
  const ownedTransients = new Set(input.ownedTransientMessages ?? []);
  const usedTransients = new Set<any>();
  const usedSources = new Set<TSource>();
  const items: NormalizedContextMessage<TSource>[] = [];
  const quarantines: ContextMessageQuarantine[] = [];

  for (const [position, message] of input.messages.entries()) {
    if (ownedTransients.has(message)) {
      if (usedTransients.has(message)) {
        const quarantine = quarantineFor(position, message, "transient_reused");
        quarantines.push(quarantine);
        items.push({ position, message, disposition: "quarantined", reason: quarantine.reason });
        continue;
      }
      usedTransients.add(message);
      items.push({ position, message, disposition: "eligible", ownedTransient: true });
      continue;
    }

    const matches = input.sources.filter((source) => contextMessageMatchesSource(message, source));
    if (matches.length === 0) {
      // User messages are mandatory request context and are never selectable evidence. Retain the
      // host-observed user value while refusing to infer a canonical ref for it.
      if (contextMessageRole(message) === "user") {
        items.push({ position, message, disposition: "eligible", reason: "user_source_unavailable" });
        continue;
      }
      const quarantine = quarantineFor(
        position,
        message,
        `source_not_found:${contextMessageRole(message) ?? "message"}`,
      );
      quarantines.push(quarantine);
      items.push({ position, message, disposition: "quarantined", reason: quarantine.reason });
      continue;
    }
    if (matches.length > 1) {
      const source = matches[0];
      const quarantine = quarantineFor(position, message, `ambiguous_source:${source.kind}`, source);
      quarantines.push(quarantine);
      items.push({
        position,
        message,
        source,
        ref: contextRefForEntry(source.source.entryId),
        disposition: "quarantined",
        reason: quarantine.reason,
      });
      continue;
    }

    const source = matches[0];
    const ref = contextRefForEntry(source.source.entryId);
    if (usedSources.has(source)) {
      const quarantine = quarantineFor(position, message, `source_reused:${ref}`, source);
      quarantines.push(quarantine);
      items.push({ position, message, source, ref, disposition: "quarantined", reason: quarantine.reason });
      continue;
    }
    usedSources.add(source);

    const reason =
      source.replayability === "quarantined"
        ? (source.quarantineReason ?? "source_quarantined")
        : structuralQuarantineReason(message);
    if (reason) {
      const quarantine = quarantineFor(position, message, reason, source);
      quarantines.push(quarantine);
      items.push({ position, message, source, ref, disposition: "quarantined", reason });
      continue;
    }
    items.push({ position, message, source, ref, disposition: "eligible" });
  }

  return { items, quarantines };
}
