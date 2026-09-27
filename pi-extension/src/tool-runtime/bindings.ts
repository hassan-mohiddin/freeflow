import type { Json, VersionedOperationDescriptor } from "./contracts.js";

const MAX_BINDING_BYTES = 16 * 1024;

export class BindingError extends Error {
  constructor(
    readonly code: "binding_unsupported" | "binding_limit",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "BindingError";
  }
}

function safeComment(value: string): string {
  return value.replaceAll("*/", "*\\/").replace(/[\u0000-\u001f\u007f]/g, " ");
}

function constraints(schema: Record<string, any>): string {
  const items = [
    ...["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"]
      .filter((key) => schema[key] !== undefined)
      .map((key) => `${key}=${schema[key]}`),
    ...(schema.pattern !== undefined ? [`pattern=${JSON.stringify(schema.pattern)}`] : []),
    ...(schema.uniqueItems === true ? ["uniqueItems"] : []),
  ];
  return items.length ? ` /* ${safeComment(items.join(", "))}; enforced by runtime */` : "";
}

function primitive(value: Json): string {
  if (value === null || ["string", "boolean", "number"].includes(typeof value)) return JSON.stringify(value);
  throw new BindingError("binding_unsupported", "Non-primitive schema literals cannot be represented exactly.");
}

function typeFor(value: Json, depth = 0): string {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 16)
    throw new BindingError("binding_unsupported", "Registered schema has an unsupported shape.");
  const schema = value as Record<string, any>;
  if (schema.const !== undefined) return `${primitive(schema.const)}${constraints(schema)}`;
  if (schema.enum !== undefined) return `(${schema.enum.map(primitive).join(" | ")})${constraints(schema)}`;
  switch (schema.type) {
    case "null":
      return "null";
    case "boolean":
      return "boolean";
    case "string":
      return `string${constraints(schema)}`;
    case "number":
      return `number${constraints(schema)}`;
    case "integer": {
      const bounds = constraints(schema);
      return `number /* integer${bounds ? `; ${bounds.slice(4, -3)}` : "; enforced by runtime"} */`;
    }
    case "array":
      return `ReadonlyArray<${typeFor(schema.items, depth + 1)}>${constraints(schema)}`;
    case "object": {
      if (schema.additionalProperties !== false || !schema.properties || typeof schema.properties !== "object")
        throw new BindingError("binding_unsupported", "Open or malformed object schemas are unsupported.");
      const required = new Set<string>(schema.required ?? []);
      const members = Object.entries(schema.properties)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([key, child]) =>
            `${"  ".repeat(depth + 1)}${JSON.stringify(key)}${required.has(key) ? "" : "?"}: ${typeFor(child as Json, depth + 1)};`,
        );
      return `{${members.length ? `\n${members.join("\n")}\n${"  ".repeat(depth)}` : ""}}${constraints(schema)}`;
    }
    default:
      throw new BindingError("binding_unsupported", "Registered schema type is unsupported.");
  }
}

function identifier(descriptor: VersionedOperationDescriptor): string {
  return `FF_${descriptor.key.id.replace(/[^A-Za-z0-9]/g, "_")}_${descriptor.key.revision.replace(/[^A-Za-z0-9]/g, "_")}`;
}

/** One exact revision per snippet. Never merge overloads for two revisions of the same ID. */
export function renderProgramBinding(descriptor: VersionedOperationDescriptor): string {
  if (!descriptor.exposure.programmatic)
    throw new BindingError("binding_unsupported", "Operation is not exposed to programs.");
  const { id, revision } = descriptor.key;
  const name = identifier(descriptor);
  const input = typeFor(descriptor.inputSchema);
  const output = typeFor(descriptor.outputSchema);
  const lines = [
    `/** ${id}@${revision} · descriptor ${descriptor.fingerprint} · effects ${descriptor.effects.join("|")}`,
    ` * Outer freeflow_run.operations must include { id: ${JSON.stringify(id)}, revision: ${JSON.stringify(revision)} }.`,
    " * Guest tools.invoke returns only the validated canonical Value; coverage/status/effectState are host-side facts.",
    " * On failure it throws Error with code and effectState; needs-model interrupts the program.",
    " * JSON Schema bounds, patterns, exact keys and formats remain runtime-validated, not TypeScript guarantees.",
    " */",
    `namespace ${name} {`,
    `  type Input = ${input.replaceAll("\n", "\n  ")};`,
    `  type Value = ${output.replaceAll("\n", "\n  ")};`,
    `  interface Tools { invoke(id: ${JSON.stringify(id)}, args: Input): Promise<Value>; }`,
    "}",
  ];
  const text = `${lines.join("\n")}\n`;
  if (Buffer.byteLength(text, "utf8") > MAX_BINDING_BYTES)
    throw new BindingError("binding_limit", "Complete operation declaration exceeds its byte limit.");
  return text;
}

export function boundedProgramBinding(descriptor: VersionedOperationDescriptor): Json {
  try {
    const text = renderProgramBinding(descriptor);
    return {
      state: "complete",
      descriptorFingerprint: descriptor.fingerprint,
      bytes: Buffer.byteLength(text, "utf8"),
      text,
    };
  } catch (error) {
    if (!(error instanceof BindingError)) throw error;
    return { state: "unavailable", reason: error.code, descriptorFingerprint: descriptor.fingerprint };
  }
}
