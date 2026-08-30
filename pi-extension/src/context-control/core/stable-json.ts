import { createHash } from "node:crypto";

type StableJsonValue = null | boolean | number | string | StableJsonValue[] | { [key: string]: StableJsonValue };

function normalizeValue(value: unknown): StableJsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item) ?? null);
  if (typeof value === "object") {
    const result: { [key: string]: StableJsonValue } = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizeValue(item);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return undefined;
}

function sortValue(value: StableJsonValue): StableJsonValue {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortValue(value[key])]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  const normalized = normalizeValue(value);
  return normalized === undefined ? "undefined" : JSON.stringify(sortValue(normalized));
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
