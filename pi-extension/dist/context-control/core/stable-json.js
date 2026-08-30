import { createHash } from "node:crypto";
function normalizeValue(value) {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => normalizeValue(item) ?? null);
  if (typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = normalizeValue(item);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  }
  return undefined;
}
function sortValue(value) {
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
export function stableJson(value) {
  const normalized = normalizeValue(value);
  return normalized === undefined ? "undefined" : JSON.stringify(sortValue(normalized));
}
export function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
