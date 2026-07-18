import { sha256 } from "./hash.mjs";

const TYPES = new Set(["H", "S", "F", "O", "R"]);
const RECOVERABILITY = new Map([
  ["none", 0],
  ["hint-only", 1],
  ["metadata-only", 2],
  ["exact-source", 3],
  ["exact", 4],
]);
const HASH = /^[a-f0-9]{64}$/;
const OPERATION = /^.+@[a-f0-9]{64}$/;
const KEY = /^[A-Za-z][A-Za-z0-9_.-]*$/;

function escapeValue(value) {
  let output = "";
  for (const character of String(value)) {
    const code = character.codePointAt(0);
    if (character === "\\") output += "\\\\";
    else if (character === "|") output += "\\|";
    else if (character === "\n") output += "\\n";
    else if (character === "\r") output += "\\r";
    else if (code < 0x20 || code === 0x7f) output += `\\x${code.toString(16).padStart(2, "0")}`;
    else output += character;
  }
  return output;
}

function unescapeValue(value) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      output += character;
      continue;
    }
    const escaped = value[++index];
    if (escaped === undefined) throw new Error("Invalid trailing CEV1 escape");
    if (escaped === "\\" || escaped === "|") output += escaped;
    else if (escaped === "n") output += "\n";
    else if (escaped === "r") output += "\r";
    else if (escaped === "x") {
      const hex = value.slice(index + 1, index + 3);
      if (!/^[a-f0-9]{2}$/i.test(hex)) throw new Error("Invalid CEV1 control escape");
      output += String.fromCodePoint(Number.parseInt(hex, 16));
      index += 2;
    } else throw new Error(`Invalid CEV1 escape: \\${escaped}`);
  }
  return output;
}

function codeUnitOrder([left], [right]) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function splitRecord(line) {
  const parts = [];
  let part = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      if (index + 1 >= line.length) throw new Error("Invalid trailing CEV1 escape");
      part += character + line[++index];
    } else if (character === "|") {
      parts.push(part);
      part = "";
    } else part += character;
  }
  parts.push(part);
  return parts;
}

function scalar(value, label) {
  if (!["string", "number", "boolean"].includes(typeof value)) throw new Error(`${label} must be a scalar`);
  return String(value);
}

function requireField(record, name) {
  const value = record.fields?.[name];
  if (value === undefined || value === null || String(value).length === 0)
    throw new Error(`${record.type} record requires ${name}`);
  return String(value);
}

function recovery(value, label) {
  if (!RECOVERABILITY.has(value)) throw new Error(`${label} has invalid recoverability: ${value}`);
  return RECOVERABILITY.get(value);
}

function validateRecords(records) {
  if (!Array.isArray(records) || records.length < 2) throw new Error("CEV1 needs ordered records");
  if (records[0]?.type !== "H" || records[0]?.schema !== "CEV1") throw new Error("CEV1 must start with H|CEV1");
  if (records.at(-1)?.type !== "R") throw new Error("CEV1 must end with an R recovery record");
  if (records.filter((record) => record.type === "H").length !== 1) throw new Error("CEV1 needs exactly one H record");
  if (records.filter((record) => record.type === "R").length !== 1) throw new Error("CEV1 needs exactly one R record");

  const sources = new Map();
  for (const record of records) {
    if (!TYPES.has(record?.type)) throw new Error(`Unknown CEV1 record type: ${record?.type}`);
    for (const [key, value] of Object.entries(record.fields ?? {})) {
      if (!KEY.test(key)) throw new Error(`Invalid CEV1 field key: ${key}`);
      scalar(value, `${record.type}.${key}`);
    }
    if (record.type === "S") {
      const id = requireField(record, "id");
      requireField(record, "kind");
      if (record.fields.path === undefined && record.fields.output === undefined)
        throw new Error("S record requires path or output");
      if (!HASH.test(requireField(record, "sha256"))) throw new Error("S record requires a SHA-256 identity");
      const bytes = Number(requireField(record, "bytes"));
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("S record bytes must be a non-negative integer");
      recovery(requireField(record, "recovery"), "S record");
      if (sources.has(id)) throw new Error(`Duplicate CEV1 source: ${id}`);
      sources.set(id, record);
    }
  }

  for (const record of records) {
    if (record.type === "F") {
      requireField(record, "name");
      requireField(record, "value");
      const sourceId = requireField(record, "source");
      requireField(record, "span");
      if (!OPERATION.test(requireField(record, "op")))
        throw new Error("F record op must include an operation SHA-256 identity");
      const factRecovery = recovery(requireField(record, "recovery"), "F record");
      const source = sources.get(sourceId);
      if (!source) throw new Error(`F record references unknown source: ${sourceId}`);
      const sourceRecovery = recovery(String(source.fields.recovery), "S record");
      if (factRecovery > sourceRecovery) throw new Error("Fact recoverability cannot exceed source recoverability");
    } else if (record.type === "O") {
      requireField(record, "kind");
      requireField(record, "reason");
      const omittedBytes = Number(requireField(record, "omittedBytes"));
      if (!Number.isSafeInteger(omittedBytes) || omittedBytes < 1)
        throw new Error("O record omittedBytes must be a positive integer");
      const sourceId = requireField(record, "source");
      requireField(record, "span");
      if (!OPERATION.test(requireField(record, "op")))
        throw new Error("O record op must include an operation SHA-256 identity");
      const omissionRecovery = recovery(requireField(record, "recovery"), "O record");
      const source = sources.get(sourceId);
      if (!source) throw new Error(`O record references unknown source: ${sourceId}`);
      if (omissionRecovery > recovery(String(source.fields.recovery), "S record"))
        throw new Error("Omission recoverability cannot exceed source recoverability");
    } else if (record.type === "R") {
      requireField(record, "bundle");
      if (!HASH.test(requireField(record, "canonicalSha256"))) throw new Error("R record requires canonicalSha256");
      if (requireField(record, "recovery") !== "exact") throw new Error("R record must declare exact recovery");
    }
  }
  return records;
}

export function encodeCev1(records) {
  validateRecords(records);
  const lines = records.map((record) => {
    const prefix = record.type === "H" ? ["H", "CEV1"] : [record.type];
    const fields = Object.entries(record.fields ?? {})
      .sort(codeUnitOrder)
      .map(([key, value]) => `${key}=${escapeValue(scalar(value, `${record.type}.${key}`))}`);
    return [...prefix, ...fields].join("|");
  });
  return `${lines.join("\n")}\n`;
}

export function decodeCev1(text) {
  if (typeof text !== "string" || !text.endsWith("\n")) throw new Error("CEV1 must end with a newline");
  for (const character of text) {
    const code = character.codePointAt(0);
    if ((code < 0x20 && character !== "\n") || code === 0x7f)
      throw new Error("CEV1 contains an unescaped control byte");
  }
  const records = text
    .slice(0, -1)
    .split("\n")
    .map((line) => {
      const parts = splitRecord(line);
      const type = parts.shift();
      const record = { type, fields: {} };
      if (type === "H") {
        record.schema = parts.shift();
      }
      for (const part of parts) {
        const separator = part.indexOf("=");
        if (separator <= 0) throw new Error(`Invalid CEV1 field: ${part}`);
        const key = part.slice(0, separator);
        if (Object.hasOwn(record.fields, key)) throw new Error(`Duplicate CEV1 field: ${key}`);
        record.fields[key] = unescapeValue(part.slice(separator + 1));
      }
      return record;
    });
  return validateRecords(records);
}

export function renderCompactEvidence({ canonical, records }) {
  const canonicalText = `${JSON.stringify(canonical, null, 2)}\n`;
  const canonicalSha256 = sha256(canonicalText);
  const canonicalBytes = Buffer.byteLength(canonicalText);
  let compactText;
  let sourceOmitted = 0;
  try {
    compactText = encodeCev1(records);
    sourceOmitted = records
      .filter((record) => record.type === "O")
      .reduce((sum, record) => sum + Number(record.fields.omittedBytes), 0);
    const recoveryRecord = records.at(-1);
    if (String(recoveryRecord.fields.canonicalSha256) !== canonicalSha256)
      throw new Error("R canonicalSha256 does not match canonical evidence");
  } catch (error) {
    return {
      format: "canonical-json",
      content: canonicalText,
      reason: "lineage-invalid",
      lineage_error: error instanceof Error ? error.message : String(error),
      bytes: { canonical: canonicalBytes, compact: null, savings: 0, source_omitted: 0 },
      recovery: { class: "exact", canonical_sha256: canonicalSha256 },
    };
  }
  const compactBytes = Buffer.byteLength(compactText);
  if (compactBytes >= canonicalBytes) {
    return {
      format: "canonical-json",
      content: canonicalText,
      reason: "compact-not-smaller",
      bytes: { canonical: canonicalBytes, compact: compactBytes, savings: 0, source_omitted: sourceOmitted },
      recovery: { class: "exact", canonical_sha256: canonicalSha256 },
    };
  }
  return {
    format: "cev1",
    content: compactText,
    reason: "compact-smaller",
    bytes: {
      canonical: canonicalBytes,
      compact: compactBytes,
      savings: canonicalBytes - compactBytes,
      source_omitted: sourceOmitted,
    },
    recovery: { class: "exact", canonical_sha256: canonicalSha256 },
  };
}
