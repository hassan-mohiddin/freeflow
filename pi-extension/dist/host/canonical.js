const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
/** Deterministic JSON: object keys sorted, undefined properties omitted, so equal values serialize equally. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
