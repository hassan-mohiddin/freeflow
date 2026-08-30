import { sha256Text } from "../core/stable-json.js";
export const CHECKPOINT_DETECTOR_VERSION = "0.1";
export const CHECKPOINT_DETECTOR_STATUSES = ["none", "candidate", "defer"];
const HISTORICAL_PATTERN = /\b(?:initial|original|prior|previous|earlier|historical|before)\b/iu;
const EXACT_PATTERN = /\b(?:exact|verbatim|complete|contiguous|quote|quoted|copy|line|checksum|hash)\b/iu;
const CURRENT_PATTERN = /\b(?:current|latest|now|present|implement|write|change|edit|add|remove|fix)\b/iu;
const COMPARISON_PATTERN = /\b(?:compare|comparison|versus|vs\.?|difference)\b|\bbefore\s+and\s+after\b/iu;
const IDENTIFIER_PATTERN = /\b(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\b/gu;
const ROLE_PATTERNS = Object.freeze({
  "verification-output":
    /\b(?:test|tests|suite|failure|failed|fail|error|diagnostic|verification|verify|command|output|result)\b/iu,
  "source-content": /\b(?:source|file|line|declaration|config(?:uration)?|setting|code|implementation|value)\b/iu,
  observation: /\b(?:observ(?:e|ed|ation)|state|snapshot|status)\b/iu,
  "mutation-receipt": /\b(?:receipt|diff|patch|commit|mutation)\b/iu,
});
function normalizedPrompt(prompt) {
  return prompt.normalize("NFKC").replace(/\s+/gu, " ").trim();
}
export function checkpointPromptHash(prompt) {
  return sha256Text(normalizedPrompt(prompt));
}
function roleFor(prompt) {
  const roles = Object.entries(ROLE_PATTERNS)
    .filter(([, pattern]) => pattern.test(prompt))
    .map(([role]) => role);
  return roles.length === 1 ? roles[0] : undefined;
}
export function requirementFromPrompt(prompt, checkpointId, generation) {
  if (typeof prompt !== "string" || normalizedPrompt(prompt) === "") return undefined;
  const text = normalizedPrompt(prompt);
  if (!HISTORICAL_PATTERN.test(text) || (CURRENT_PATTERN.test(text) && !EXACT_PATTERN.test(text))) return undefined;
  if (COMPARISON_PATTERN.test(text)) return undefined;
  const role = roleFor(text);
  if (role === undefined) return undefined;
  const promptHash = checkpointPromptHash(text);
  const identifiers = Object.freeze([...new Set(text.match(IDENTIFIER_PATTERN) ?? [])]);
  return {
    id: `cc-requirement-${promptHash.slice(0, 24)}-${generation}`,
    checkpointId,
    generation,
    promptHash,
    requestText: text,
    exactRequired: EXACT_PATTERN.test(text),
    role,
    temporal: /\bbefore\s+(?:the\s+)?(?:edit|change|mutation|patch|update)\b/iu.test(text)
      ? "before-change"
      : "historical",
    cardinality: "single",
    ...(identifiers.length === 0 ? {} : { identifiers }),
    status: "missing",
  };
}
export function detectCheckpointEvidenceNeed(requirement, input) {
  if (requirement === undefined) return { status: "none", reason: "no-explicit-requirement" };
  if (requirement.status === "satisfied" || input.accepted)
    return {
      status: "none",
      reason: requirement.status === "satisfied" ? "requirement-satisfied" : "accepted-evidence",
    };
  if (input.visible === "sufficient") return { status: "none", reason: "visible-sufficient" };
  if (input.visible === "unknown" || input.retained === "unknown")
    return { status: "defer", reason: "visibility-ambiguous" };
  if (!requirement.exactRequired && input.retained === "sufficient")
    return { status: "none", reason: "retained-sufficient" };
  if (!input.hiddenAvailable) return { status: "defer", reason: "hidden-evidence-unavailable" };
  return {
    status: "candidate",
    need: {
      text: requirement.requestText,
      exactRequired: requirement.exactRequired,
      ...(requirement.identifiers === undefined ? {} : { identifiers: requirement.identifiers }),
      intent: { role: requirement.role, temporal: requirement.temporal },
      cardinality: { kind: "single" },
    },
    requirementId: requirement.id,
    checkpointId: requirement.checkpointId,
    generation: requirement.generation,
    promptHash: requirement.promptHash,
    signals: Object.freeze([
      "checkpoint-scoped",
      "harness-evidence-gap",
      requirement.exactRequired ? "explicit-exactness" : "historical-requirement",
      `role:${requirement.role}`,
      `temporal:${requirement.temporal}`,
    ]),
  };
}
export class CheckpointEvidenceNeedDetector {
  seen = new Set();
  detect(requirement, input) {
    const result = detectCheckpointEvidenceNeed(requirement, input);
    if (result.status !== "candidate") return result;
    const key = `${result.requirementId}|${result.checkpointId}|${result.generation}`;
    if (this.seen.has(key)) return { status: "none", reason: "duplicate" };
    this.seen.add(key);
    return result;
  }
  reset() {
    this.seen.clear();
  }
}
