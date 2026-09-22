import { createHash } from "node:crypto";

import type { Json } from "./contracts.js";

const MAX_SCHEMA_BYTES = 64 * 1024;
const MAX_SCHEMA_DEPTH = 16;
const MAX_VALUE_DEPTH = 64;
const MAX_COLLECTION_ITEMS = 100_000;
const COMMON_KEYS = ["type", "description", "title", "enum", "const"] as const;

export class SchemaError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "SchemaError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalValue(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key]!)}`)
    .join(",")}}`;
}

export function canonicalJson(value: Json): string {
  return canonicalValue(value);
}

export function jsonDigest(value: Json): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function cloneJson(value: unknown, path = "$", depth = 0, seen = new Set<object>()): Json {
  if (depth > MAX_VALUE_DEPTH) throw new SchemaError("value_depth", `${path} exceeds supported JSON depth.`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value as Json;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SchemaError("invalid_json", `${path} is not a finite JSON number.`);
    return value;
  }
  if (typeof value !== "object" || seen.has(value as object)) {
    throw new SchemaError("invalid_json", `${path} is not lossless JSON.`);
  }
  seen.add(value as object);
  let output: Json;
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ITEMS) throw new SchemaError("value_size", `${path} has too many items.`);
    output = value.map((item, index) => cloneJson(item, `${path}[${index}]`, depth + 1, seen));
  } else {
    if (!record(value)) throw new SchemaError("invalid_json", `${path} has an unsupported prototype.`);
    const keys = Object.keys(value);
    if (keys.length > MAX_COLLECTION_ITEMS) throw new SchemaError("value_size", `${path} has too many properties.`);
    const result: Record<string, Json> = {};
    for (const key of keys) {
      if (key.length > 4096) throw new SchemaError("value_size", `${path} has an oversized property name.`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.get || descriptor.set) {
        throw new SchemaError("invalid_json", `${path}.${key} is not a data property.`);
      }
      result[key] = cloneJson(descriptor.value, `${path}.${key}`, depth + 1, seen);
    }
    output = result;
  }
  seen.delete(value as object);
  return output;
}

function deepFreeze<T extends Json>(value: T): T {
  if (value && typeof value === "object") {
    for (const item of Array.isArray(value) ? value : Object.values(value)) deepFreeze(item as Json);
    Object.freeze(value);
  }
  return value;
}

export function freezeJson(value: unknown): Json {
  return deepFreeze(cloneJson(value));
}

function integer(value: unknown, minimum = 0): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function validateSchema(schema: unknown, path = "$", depth = 0): asserts schema is Record<string, Json> {
  if (depth > MAX_SCHEMA_DEPTH || !record(schema)) throw new SchemaError("schema_invalid", `${path} is invalid.`);
  const type = schema.type;
  if (!["object", "array", "string", "number", "integer", "boolean", "null"].includes(String(type))) {
    throw new SchemaError("schema_type", `${path}.type is unsupported.`);
  }
  const typeKeys: Record<string, string[]> = {
    object: ["properties", "required", "additionalProperties", "minProperties", "maxProperties"],
    array: ["items", "minItems", "maxItems", "uniqueItems"],
    string: ["minLength", "maxLength", "pattern"],
    number: ["minimum", "maximum"],
    integer: ["minimum", "maximum"],
    boolean: [],
    null: [],
  };
  const allowed = new Set([...COMMON_KEYS, ...typeKeys[String(type)]!]);
  const unknown = Object.keys(schema).find((key) => !allowed.has(key));
  if (unknown) throw new SchemaError("schema_keyword", `${path}.${unknown} is unsupported.`);
  if (schema.description !== undefined && typeof schema.description !== "string")
    throw new SchemaError("schema_invalid", `${path}.description must be a string.`);
  if (schema.title !== undefined && typeof schema.title !== "string")
    throw new SchemaError("schema_invalid", `${path}.title must be a string.`);
  if (schema.const !== undefined) freezeJson(schema.const);
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length < 1 || schema.enum.length > 64)
      throw new SchemaError("schema_invalid", `${path}.enum must contain 1-64 values.`);
    for (const value of schema.enum) freezeJson(value);
  }
  if (type === "object") {
    if (!record(schema.properties) || Object.keys(schema.properties).length > 128)
      throw new SchemaError("schema_invalid", `${path}.properties is invalid.`);
    if (schema.additionalProperties !== false)
      throw new SchemaError("schema_open", `${path} must set additionalProperties=false.`);
    const required = schema.required ?? [];
    if (
      !Array.isArray(required) ||
      !required.every((key) => typeof key === "string") ||
      new Set(required).size !== required.length
    )
      throw new SchemaError("schema_invalid", `${path}.required is invalid.`);
    for (const key of required) {
      if (!Object.hasOwn(schema.properties, key))
        throw new SchemaError("schema_invalid", `${path}.required names ${key}.`);
    }
    for (const [key, child] of Object.entries(schema.properties))
      validateSchema(child, `${path}.properties.${key}`, depth + 1);
    for (const key of ["minProperties", "maxProperties"])
      if (schema[key] !== undefined && !integer(schema[key]))
        throw new SchemaError("schema_invalid", `${path}.${key} is invalid.`);
  } else if (type === "array") {
    validateSchema(schema.items, `${path}.items`, depth + 1);
    for (const key of ["minItems", "maxItems"])
      if (schema[key] !== undefined && !integer(schema[key]))
        throw new SchemaError("schema_invalid", `${path}.${key} is invalid.`);
    if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean")
      throw new SchemaError("schema_invalid", `${path}.uniqueItems is invalid.`);
  } else if (type === "string") {
    for (const key of ["minLength", "maxLength"])
      if (schema[key] !== undefined && !integer(schema[key]))
        throw new SchemaError("schema_invalid", `${path}.${key} is invalid.`);
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== "string" || schema.pattern.length > 1024)
        throw new SchemaError("schema_invalid", `${path}.pattern is invalid.`);
      try {
        new RegExp(schema.pattern);
      } catch {
        throw new SchemaError("schema_invalid", `${path}.pattern is invalid.`);
      }
    }
  } else if (type === "number" || type === "integer") {
    for (const key of ["minimum", "maximum"])
      if (schema[key] !== undefined && (typeof schema[key] !== "number" || !Number.isFinite(schema[key])))
        throw new SchemaError("schema_invalid", `${path}.${key} is invalid.`);
  }
}

function equalJson(a: Json, b: Json): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function check(value: Json, schema: Record<string, any>, path: string): string | undefined {
  if (schema.const !== undefined && !equalJson(value, schema.const)) return `${path} differs from const.`;
  if (schema.enum && !schema.enum.some((candidate: Json) => equalJson(value, candidate)))
    return `${path} is not in enum.`;
  switch (schema.type) {
    case "null":
      return value === null ? undefined : `${path} must be null.`;
    case "boolean":
      return typeof value === "boolean" ? undefined : `${path} must be boolean.`;
    case "number":
    case "integer": {
      if (typeof value !== "number" || (schema.type === "integer" && !Number.isSafeInteger(value)))
        return `${path} must be ${schema.type}.`;
      if (schema.minimum !== undefined && value < schema.minimum) return `${path} is below minimum.`;
      if (schema.maximum !== undefined && value > schema.maximum) return `${path} exceeds maximum.`;
      return undefined;
    }
    case "string":
      if (typeof value !== "string") return `${path} must be string.`;
      if (value.length < (schema.minLength ?? 0)) return `${path} is shorter than minLength.`;
      if (value.length > (schema.maxLength ?? Infinity)) return `${path} exceeds maxLength.`;
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${path} does not match pattern.`;
      return undefined;
    case "array": {
      if (!Array.isArray(value)) return `${path} must be array.`;
      if (value.length < (schema.minItems ?? 0)) return `${path} has too few items.`;
      if (value.length > (schema.maxItems ?? Infinity)) return `${path} has too many items.`;
      if (schema.uniqueItems && new Set(value.map(canonicalJson)).size !== value.length)
        return `${path} has duplicate items.`;
      for (let index = 0; index < value.length; index += 1) {
        const error = check(value[index]!, schema.items, `${path}[${index}]`);
        if (error) return error;
      }
      return undefined;
    }
    case "object": {
      if (!record(value)) return `${path} must be object.`;
      const keys = Object.keys(value);
      if (keys.length < (schema.minProperties ?? 0)) return `${path} has too few properties.`;
      if (keys.length > (schema.maxProperties ?? Infinity)) return `${path} has too many properties.`;
      for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) return `${path}.${key} is required.`;
      for (const key of keys) {
        if (!Object.hasOwn(schema.properties, key)) return `${path}.${key} is not allowed.`;
        const error = check(value[key]!, schema.properties[key], `${path}.${key}`);
        if (error) return error;
      }
      return undefined;
    }
  }
}

export interface CompiledSchema {
  readonly schema: Json;
  readonly digest: string;
  validate(value: unknown): { ok: true; value: Json } | { ok: false; error: string };
  parse(value: unknown): Json;
}

export function compileSchema(input: unknown): CompiledSchema {
  const schema = freezeJson(input);
  if (Buffer.byteLength(canonicalJson(schema), "utf8") > MAX_SCHEMA_BYTES)
    throw new SchemaError("schema_size", "Schema exceeds the supported byte limit.");
  validateSchema(schema);
  const digest = jsonDigest(schema);
  return Object.freeze({
    schema,
    digest,
    validate(value: unknown) {
      try {
        const frozen = freezeJson(value);
        const error = check(frozen, schema as Record<string, any>, "$input");
        return error ? { ok: false as const, error } : { ok: true as const, value: frozen };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    },
    parse(value: unknown) {
      const result = this.validate(value);
      if (!result.ok) throw new SchemaError("value_invalid", result.error);
      return result.value;
    },
  });
}
