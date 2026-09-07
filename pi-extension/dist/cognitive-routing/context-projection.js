import { isDeepStrictEqual } from "node:util";
import { contextRefForEntry, entryIdFromContextRef } from "../freeflow-context/types.js";
function messageRole(message) {
  return typeof message?.role === "string" ? message.role : undefined;
}
function refFor(source) {
  return typeof source.source.entryId === "string" ? contextRefForEntry(source.source.entryId) : undefined;
}
function normalizeRefs(values) {
  const refs = [];
  const seen = new Set();
  for (const value of values ?? []) {
    const entryId = entryIdFromContextRef(value);
    if (!entryId) return { status: "rejected", reason: "requested_ref_invalid" };
    const ref = contextRefForEntry(entryId);
    if (seen.has(ref)) return { status: "rejected", reason: `requested_ref_duplicate:${ref}` };
    seen.add(ref);
    refs.push(ref);
  }
  return { status: "ok", refs };
}
function requestedRefs(input) {
  const groups = {
    include: normalizeRefs(input.include),
    previous: normalizeRefs(input.previous),
    shared: normalizeRefs(input.shared),
    required: normalizeRefs(input.required),
  };
  for (const group of Object.values(groups)) {
    if (group.status === "rejected") return group;
  }
  const all = [];
  const seen = new Set();
  for (const refs of [groups.include, groups.previous, groups.shared, groups.required]) {
    if (refs.status !== "ok") continue;
    for (const ref of refs.refs) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      all.push(ref);
    }
  }
  return {
    include: groups.include.status === "ok" ? groups.include.refs : [],
    previous: groups.previous.status === "ok" ? groups.previous.refs : [],
    shared: groups.shared.status === "ok" ? groups.shared.refs : [],
    required: groups.required.status === "ok" ? groups.required.refs : [],
    all,
  };
}
function toolCalls(message) {
  const calls = new Map();
  if (messageRole(message) !== "assistant" || !Array.isArray(message.content)) return calls;
  for (const part of message.content) {
    if (part?.type !== "toolCall") continue;
    if (typeof part.id !== "string" || typeof part.name !== "string") {
      return { status: "rejected", reason: "assistant_tool_call_invalid" };
    }
    if (calls.has(part.id)) return { status: "rejected", reason: "assistant_tool_call_ids_ambiguous" };
    calls.set(part.id, part.name);
  }
  return calls;
}
function omittedToolResult(message) {
  return { ...message, content: [{ type: "text", text: "[context omitted]" }] };
}
function sourceMatches(message, source) {
  return source.message !== undefined && (source.message === message || isDeepStrictEqual(source.message, message));
}
function rejected(reason) {
  return { status: "rejected", reason };
}
function groupItems(items) {
  const groups = [];
  for (let index = 0; index < items.length; index += 1) {
    const assistant = items[index];
    if (messageRole(assistant.message) !== "assistant") continue;
    const calls = toolCalls(assistant.message);
    if (!(calls instanceof Map)) return calls;
    const group = { assistant, calls, results: [], danglingResults: [] };
    groups.push(group);
    if (calls.size === 0) continue;
    for (let resultIndex = index + 1; resultIndex < items.length; resultIndex += 1) {
      const candidate = items[resultIndex];
      if (messageRole(candidate.message) !== "toolResult") break;
      if (calls.has(candidate.message.toolCallId)) {
        group.results.push(candidate);
      } else {
        group.danglingResults.push(candidate);
      }
    }
  }
  return groups;
}
function itemForRef(items, ref) {
  return items.find((item) => item.ref === ref);
}
function isStandardSource(item) {
  return item.source?.profile === "standard";
}
export function projectReasoningContext(input) {
  const requested = requestedRefs(input);
  if (!("all" in requested)) return requested;
  const sourcesByRef = new Map();
  for (const source of input.sources) {
    if (source.source.sessionId !== input.sessionId) {
      return rejected(`source_session_mismatch:${refFor(source) ?? source.kind}`);
    }
    const ref = refFor(source);
    if (!ref) continue;
    if (sourcesByRef.has(ref)) return rejected(`duplicate_source_ref:${ref}`);
    sourcesByRef.set(ref, source);
  }
  for (const ref of requested.all) {
    const source = sourcesByRef.get(ref);
    if (!source) return rejected(`requested_ref_not_found:${ref}`);
  }
  for (const ref of requested.include) {
    const source = sourcesByRef.get(ref);
    if (source?.profile !== "standard") return rejected(`include_ref_not_standard:${ref}`);
    if (typeof source.blockId !== "string" || source.blockId.length === 0) {
      return rejected(`include_ref_block_unavailable:${ref}`);
    }
  }
  const usedSources = new Set();
  const ownedTransientMessages = new Set(input.ownedTransientMessages);
  const usedTransients = new Set();
  const items = [];
  for (const [index, message] of input.messages.entries()) {
    if (ownedTransientMessages.has(message)) {
      if (usedTransients.has(message)) return rejected("transient_reused");
      usedTransients.add(message);
      items.push({ index, message });
      continue;
    }
    const matches = input.sources.filter((source) => sourceMatches(message, source));
    if (matches.length === 0) return rejected(`source_not_found:${messageRole(message) ?? "message"}`);
    if (matches.length > 1) return rejected(`ambiguous_source:${matches[0].kind}`);
    const source = matches[0];
    if (usedSources.has(source)) return rejected(`source_reused:${refFor(source) ?? source.kind}`);
    usedSources.add(source);
    const ref = refFor(source);
    items.push({ index, message, source, ...(ref ? { ref } : {}) });
  }
  for (const ref of requested.all) {
    if (!itemForRef(items, ref)) return rejected(`requested_ref_not_visible:${ref}`);
  }
  const groups = groupItems(items);
  if (!(groups instanceof Array)) return groups;
  const resultToGroup = new Map();
  for (const group of groups) {
    for (const result of group.results) resultToGroup.set(result.index, group);
  }
  const selectedSet = new Set(requested.all);
  const selectedGroups = new Set();
  for (const group of groups) {
    if (group.assistant.ref && selectedSet.has(group.assistant.ref)) selectedGroups.add(group);
    if (group.results.some((result) => result.ref && selectedSet.has(result.ref))) selectedGroups.add(group);
  }
  for (const ref of requested.all) {
    const item = itemForRef(items, ref);
    if (!item) return rejected(`requested_ref_not_visible:${ref}`);
    if (messageRole(item.message) === "toolResult" && !resultToGroup.has(item.index)) {
      return rejected(`selected_tool_result_without_assistant:${ref}`);
    }
  }
  const kept = new Set();
  const placeholders = new Map();
  const dependencyRefs = [];
  const dependencySet = new Set();
  const addDependency = (ref) => {
    if (ref && !dependencySet.has(ref)) {
      dependencySet.add(ref);
      dependencyRefs.push(ref);
    }
  };
  for (const group of groups) {
    const standardOnly = isStandardSource(group.assistant);
    const keepGroup =
      !standardOnly || selectedGroups.has(group) || group.results.some((item) => !isStandardSource(item));
    if (!keepGroup) continue;
    if (group.calls.size === 0) {
      kept.add(group.assistant.index);
      addDependency(group.assistant.ref);
      continue;
    }
    if (group.danglingResults.length > 0 || group.results.length !== group.calls.size) {
      return rejected(`selected_tool_group_incomplete:${group.assistant.ref ?? "unknown"}`);
    }
    const seenResults = new Set();
    for (const result of group.results) {
      const callId = result.message.toolCallId;
      if (seenResults.has(callId)) return rejected(`tool_result_duplicate:${callId}`);
      seenResults.add(callId);
      if (result.message.toolName !== group.calls.get(callId)) {
        return rejected(`tool_result_tool_mismatch:${callId}`);
      }
      addDependency(result.ref);
    }
    if (seenResults.size !== group.calls.size) {
      return rejected(`selected_tool_group_incomplete:${group.assistant.ref ?? "unknown"}`);
    }
    kept.add(group.assistant.index);
    addDependency(group.assistant.ref);
    for (const result of group.results) {
      if (!isStandardSource(result) || (result.ref && selectedSet.has(result.ref))) {
        kept.add(result.index);
      } else {
        placeholders.set(result.index, omittedToolResult(result.message));
      }
    }
  }
  for (const item of items) {
    const group = resultToGroup.get(item.index);
    if (group) continue;
    if (messageRole(item.message) === "toolResult") {
      if (!isStandardSource(item)) return rejected(`dangling_tool_result:${item.ref ?? "unknown"}`);
      continue;
    }
    if (!isStandardSource(item) || (item.ref !== undefined && selectedSet.has(item.ref))) kept.add(item.index);
  }
  const outputItems = items.filter((item) => kept.has(item.index) || placeholders.has(item.index));
  return {
    status: "projected",
    messages: outputItems.map((item) => placeholders.get(item.index) ?? item.message),
    visibleRefs: outputItems.flatMap((item) => (kept.has(item.index) && item.ref ? [item.ref] : [])),
    selectedRefs: requested.all,
    dependencyRefs,
  };
}
