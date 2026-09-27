const rangeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    startBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    endBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  },
  required: ["startBytes", "endBytes"],
};
const coverageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    capture: { type: "string", enum: ["complete-at-boundary", "limited", "unknown"] },
    boundary: { type: "string", minLength: 1, maxLength: 4096 },
    detail: { type: "string", minLength: 1, maxLength: 4096 },
  },
  required: ["capture", "boundary"],
};
function utf8Boundary(bytes, maximum) {
  let end = Math.min(bytes.length, maximum);
  while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
  return end;
}
export function createArtifactReadOperation(port) {
  return {
    key: { id: "result.read", revision: "2" },
    contractVersion: 2,
    category: "result",
    description: "Read a verified bounded byte range from an admitted v2 artifact; UTF-8 text or lossless base64.",
    keywords: ["result", "artifact", "read", "exact", "binary", "recovery"],
    owner: { adapterId: "freeflow.results", adapterRevision: "2", executionWorld: "captured-data" },
    guidance: {
      useWhen: "Read exact bytes from a v2 artifact on the current ancestry.",
      avoidWhen: "Use result.read@1 for legacy captured text; never infer a new producer execution from this read.",
    },
    cancellation: "settles",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: "^artifact:[0-9a-f-]{36}$", maxLength: 256 },
        offsetBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        maxBytes: { type: "integer", minimum: 1, maximum: 32_768 },
      },
      required: ["id"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", pattern: "^artifact:[0-9a-f-]{36}$", maxLength: 256 },
        data: { type: "string", maxLength: 65_536 },
        encoding: { type: "string", enum: ["utf-8", "base64"] },
        mediaType: { type: "string", minLength: 1, maxLength: 4096 },
        range: rangeSchema,
        totalBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        artifactSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
        coverage: coverageSchema,
        sourceObservation: {
          type: "object",
          additionalProperties: false,
          properties: {
            observedBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            observedSha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
          required: ["observedBytes", "observedSha256"],
        },
        nextOffsetBytes: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      },
      required: ["id", "data", "encoding", "mediaType", "range", "totalBytes", "sha256", "artifactSha256", "coverage"],
    },
    effects: ["captured-read"],
    effect: () => "captured-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize() {
      return { kind: "allowed" };
    },
    async execute(input, context) {
      const value = await port.readV2Value(input, context.signal, context.host);
      return {
        value: value,
        coverage: {
          kind: value.nextOffsetBytes === undefined ? "complete-at-boundary" : "limited",
          boundary: "verified-artifact-range",
          ...(value.nextOffsetBytes !== undefined ? { continuation: { offsetBytes: value.nextOffsetBytes } } : {}),
        },
      };
    },
    presenter: {
      async model(_input, outcome, policy) {
        const value = outcome.value;
        if (!value)
          return {
            text: "Artifact read unavailable.",
            coverage: { kind: "unknown", boundary: "verified-artifact-range" },
            artifactRefs: [],
          };
        const bytes = Buffer.from(value.data, value.encoding === "base64" ? "base64" : "utf8");
        const header = `Artifact: ${value.id}\nMedia type: ${value.mediaType}; encoding: ${value.encoding}\n`;
        const reserved = Buffer.byteLength(
          header +
            `Range: [${value.range.startBytes},${value.totalBytes}) of ${value.totalBytes} bytes\nPayload:\nNext offset: ${value.totalBytes}\n`,
          "utf8",
        );
        const available = Math.max(0, policy.maxBytes - reserved);
        let shown =
          value.encoding === "base64"
            ? Math.min(bytes.length, Math.floor((available * 3) / 4))
            : utf8Boundary(bytes, available);
        let text = "";
        for (;;) {
          const end = value.range.startBytes + shown;
          const payload =
            value.encoding === "base64"
              ? bytes.subarray(0, shown).toString("base64")
              : bytes.subarray(0, shown).toString("utf8");
          const next = end < value.totalBytes ? `Next offset: ${end}` : "End of captured artifact.";
          text = `${header}Range: [${value.range.startBytes},${end}) of ${value.totalBytes} bytes\nPayload:\n${payload}\n${next}`;
          if (Buffer.byteLength(text, "utf8") <= policy.maxBytes || shown === 0) break;
          shown = value.encoding === "base64" ? Math.max(0, shown - 3) : utf8Boundary(bytes, shown - 1);
        }
        if (!shown && bytes.length) throw new Error("Model-view budget cannot fit an exact artifact byte range.");
        const end = value.range.startBytes + shown;
        return {
          text,
          coverage:
            end < value.totalBytes
              ? { kind: "limited", boundary: "verified-artifact-range", continuation: { offsetBytes: end } }
              : (outcome.coverage ?? { kind: "complete-at-boundary", boundary: "verified-artifact-range" }),
          artifactRefs: [value.id],
        };
      },
      async ui(_input, outcome) {
        const value = outcome.value;
        return {
          summary: value
            ? `Artifact ${value.id} · [${value.range.startBytes},${value.range.endBytes}) · ${value.encoding}`
            : "Artifact read unavailable",
        };
      },
    },
  };
}
