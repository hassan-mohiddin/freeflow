import { isContextControlGeneratedTool, isSensitiveRecoverySource } from "./source-registry.js";
import { stableJson } from "./stable-json.js";
import type { ContextControlSource, LifecycleAnalysis, LifecycleCandidate } from "./types.js";

export const CONTEXT_CONTROL_RULE_VERSION = "0.3" as const;

const FAILURE_PATTERN = /(?:\bFAIL(?:ED|URE)?\b|\bERROR\b|\bFAILED\b|\bNOT OK\b|command exited with code [1-9]\d*)/i;

function failed(source: ContextControlSource): boolean {
  if (source.isError === true || (source.exitCode !== undefined && source.exitCode !== 0)) return true;
  return FAILURE_PATTERN.test(source.content.replace(/^\s*#\s*fail\s+0\s*$/gim, ""));
}

function successful(source: ContextControlSource): boolean {
  return !failed(source) && (source.exitCode === undefined || source.exitCode === 0);
}

function coverageEqual(left: ContextControlSource["coverage"], right: ContextControlSource["coverage"]): boolean {
  return stableJson(left) === stableJson(right);
}

function pathKey(source: ContextControlSource): string | undefined {
  return source.path === undefined ? undefined : stableJson({ branch: source.branchId, path: source.path.trim() });
}

function commandKey(source: ContextControlSource): string | undefined {
  return source.commandFingerprint === undefined
    ? undefined
    : stableJson({ branch: source.branchId, command: source.commandFingerprint });
}

function candidate(
  source: ContextControlSource,
  lane: LifecycleCandidate["lane"],
  rule: string,
  replacement: ContextControlSource | undefined,
  confidence: LifecycleCandidate["confidence"],
  reason: string,
  facts: Pick<
    LifecycleCandidate,
    "branchCompatible" | "coverageCompatible" | "contentEqual" | "scopeCompatible" | "verificationState"
  >,
  limitation?: string,
): LifecycleCandidate {
  return {
    sourceRef: source.ref,
    lane,
    rule,
    ...(replacement === undefined ? {} : { replacementRef: replacement.ref }),
    confidence,
    sourceCharacters: source.characters,
    reason,
    ...facts,
    ...(limitation === undefined ? {} : { limitation }),
  };
}

export function analyzeLifecycle(sources: readonly ContextControlSource[]): LifecycleAnalysis {
  const ordered = [...sources].sort(
    (left, right) => left.sequence - right.sequence || left.ref.localeCompare(right.ref),
  );
  const candidates: LifecycleCandidate[] = [];
  const candidateKeys = new Set<string>();
  const latestReads = new Map<string, ContextControlSource[]>();
  const pendingMutations = new Map<string, ContextControlSource[]>();
  const pendingFailures = new Map<string, ContextControlSource[]>();
  const latestObservations = new Map<string, ContextControlSource>();
  const broadSearches = new Map<string, ContextControlSource[]>();

  const add = (
    source: ContextControlSource,
    lane: LifecycleCandidate["lane"],
    rule: string,
    replacement: ContextControlSource | undefined,
    confidence: LifecycleCandidate["confidence"],
    reason: string,
    facts: Pick<
      LifecycleCandidate,
      "branchCompatible" | "coverageCompatible" | "contentEqual" | "scopeCompatible" | "verificationState"
    >,
    limitation?: string,
  ): void => {
    const key = `${rule}|${source.ref}|${replacement?.ref ?? ""}`;
    if (candidateKeys.has(key)) return;
    candidateKeys.add(key);
    candidates.push(candidate(source, lane, rule, replacement, confidence, reason, facts, limitation));
  };

  for (const source of ordered) {
    const branchCompatible = source.branchId.trim() !== "";
    if (isContextControlGeneratedTool(source.toolName)) continue;
    if (isSensitiveRecoverySource(source)) {
      add(
        source,
        "keep_full",
        "excluded-source-category",
        undefined,
        "hard",
        "sensitive or control-plane source is not eligible for reduction",
        { branchCompatible: false, verificationState: "unknown" },
        "source category is excluded from Context Control residency decisions",
      );
      continue;
    }
    if (source.metadataComplete === false || source.metadataIssues.length > 0) {
      add(
        source,
        "keep_full",
        "incomplete-source-metadata",
        undefined,
        "hard",
        "source identity or production metadata is incomplete",
        { branchCompatible: false, verificationState: "unknown" },
        source.metadataIssues.join(", ") || "metadata unavailable",
      );
      continue;
    }
    if (!source.consumed) {
      add(source, "keep_full", "unconsumed-result", undefined, "hard", "no later model progress confirms consumption", {
        branchCompatible,
        verificationState: "unknown",
      });
      continue;
    }

    if (source.toolName === "read" && source.path !== undefined) {
      const key = pathKey(source);
      if (key !== undefined) {
        for (const prior of latestReads.get(key) ?? []) {
          const sameCoverage = coverageEqual(prior.coverage, source.coverage);
          const contentEqual = prior.contentHash === source.contentHash;
          const completeEnough = prior.completeness !== "partial" && source.completeness !== "partial";
          const automatic = branchCompatible && sameCoverage && completeEnough && contentEqual;
          add(
            prior,
            automatic ? "automatic" : "model",
            "stale-same-path-read",
            source,
            automatic ? "high" : "ambiguous",
            automatic
              ? "later read repeated the same path, coverage, and observed content"
              : "later read differs in content, coverage, or generation",
            {
              branchCompatible,
              coverageCompatible: sameCoverage,
              contentEqual,
            },
            automatic ? undefined : "A changed or partial read does not prove historical comparison is unnecessary.",
          );
        }
        latestReads.set(key, [...(latestReads.get(key) ?? []), source]);

        for (const search of broadSearches.get(stableJson({ branch: source.branchId, turn: source.turn })) ?? []) {
          add(
            search,
            "model",
            "broad-search",
            source,
            "ambiguous",
            "focused read followed broad discovery",
            { branchCompatible, scopeCompatible: true },
            "Focused reads do not prove that uninspected search candidates are irrelevant.",
          );
        }
        for (const mutation of pendingMutations.get(key) ?? []) {
          add(
            mutation,
            "automatic",
            "mutation-receipt",
            source,
            "high",
            "later same-path read observed state after the mutation",
            { branchCompatible, scopeCompatible: true },
          );
        }
        pendingMutations.delete(key);
      }
    }

    if ((source.toolName === "edit" || source.toolName === "write") && source.path !== undefined && !failed(source)) {
      const key = pathKey(source);
      if (key !== undefined) pendingMutations.set(key, [...(pendingMutations.get(key) ?? []), source]);
    }

    if (source.toolName === "bash" && source.commandKind === "broad-search") {
      const key = stableJson({ branch: source.branchId, turn: source.turn });
      broadSearches.set(key, [...(broadSearches.get(key) ?? []), source]);
    }

    if (source.toolName === "bash" && (source.commandKind === "observation" || source.commandKind === "verification")) {
      const key = commandKey(source);
      if (key === undefined) continue;
      if (source.commandKind === "observation") {
        const previous = latestObservations.get(key);
        if (previous !== undefined && !failed(source)) {
          add(
            previous,
            "automatic",
            "superseded-observation",
            source,
            "high",
            "same command and execution scope observed a later state",
            { branchCompatible, scopeCompatible: true },
          );
        }
        latestObservations.set(key, source);
      }
      if (failed(source)) {
        pendingFailures.set(key, [...(pendingFailures.get(key) ?? []), source]);
      } else if (successful(source)) {
        for (const failure of pendingFailures.get(key) ?? []) {
          add(failure, "automatic", "resolved-failure", source, "high", "matching verification later succeeded", {
            branchCompatible,
            scopeCompatible: true,
            verificationState: "passed",
          });
        }
        pendingFailures.delete(key);
      }
    }
  }

  for (const failures of pendingFailures.values()) {
    for (const failure of failures) {
      add(
        failure,
        "keep_full",
        "unresolved-failure",
        undefined,
        "hard",
        "no compatible successful verification was observed later",
        { branchCompatible: true, scopeCompatible: true, verificationState: "failed" },
      );
    }
  }

  const bySource = new Map<string, LifecycleCandidate[]>();
  for (const item of candidates) bySource.set(item.sourceRef, [...(bySource.get(item.sourceRef) ?? []), item]);
  const effective = [...bySource.values()].map((items) => {
    const keep = items.find((item) => item.lane === "keep_full");
    if (keep !== undefined) return keep;
    const model = items.find((item) => item.lane === "model");
    if (model !== undefined) return model;
    const automatic = items.find((item) => item.lane === "automatic");
    return automatic ?? items[0];
  });
  const orderedEffective = effective.sort(
    (left, right) => left.sourceRef.localeCompare(right.sourceRef) || left.rule.localeCompare(right.rule),
  );
  const automatic = orderedEffective.filter((item) => item.lane === "automatic");
  const protectedCandidates = orderedEffective.filter((item) => item.lane === "keep_full");
  const model = orderedEffective.filter((item) => item.lane === "model");

  return {
    version: CONTEXT_CONTROL_RULE_VERSION,
    sources: Object.freeze(ordered),
    candidates: Object.freeze(candidates),
    automatic: Object.freeze(automatic),
    protected: Object.freeze(protectedCandidates),
    model: Object.freeze(model),
  };
}
