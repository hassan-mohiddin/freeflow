import type { Json, Operation } from "../contracts.js";

export interface ResultReadPort {
  read(input: Json, signal: AbortSignal | undefined, host: unknown): Promise<Json>;
}

export function createCapturedReadOperation(port: ResultReadPort): Operation<Json, Json> {
  return {
    key: { id: "result.read", revision: "1" },
    description: "Read a verified exact byte range from an existing captured result.",
    keywords: ["result", "capture", "read", "exact", "evidence"],
    owner: { adapterId: "freeflow.results", adapterRevision: "1", executionWorld: "captured-data" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", minLength: 1, maxLength: 256 },
        offsetBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        maxBytes: { type: "integer", minimum: 1, maximum: 32_768 },
      },
      required: ["id"],
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", minLength: 1, maxLength: 256 },
        text: { type: "string", maxLength: 32_768 },
        range: {
          type: "object",
          additionalProperties: false,
          properties: {
            startBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
            endBytes: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
          },
          required: ["startBytes", "endBytes"],
        },
        totalBytes: { type: "integer", minimum: 0, maximum: 4 * 1024 * 1024 },
        coverage: { type: "string", enum: ["limited", "unspecified"] },
        scope: { type: "string", enum: ["tool-result-hook"] },
        nextOffsetBytes: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      },
      required: ["id", "text", "range", "totalBytes", "coverage", "scope"],
    },
    effects: ["captured-read"],
    effect: () => "captured-read",
    concurrency: () => "read-parallel",
    exposure: { discoverable: true, direct: true, programmatic: true },
    async authorize() {
      return { kind: "allowed" };
    },
    async execute(input, context) {
      const value = await port.read(input, context.signal, context.host);
      const result = value as any;
      return {
        value,
        coverage: {
          kind: result.nextOffsetBytes === undefined ? "complete-at-boundary" : "limited",
          boundary: "captured-result",
          ...(result.nextOffsetBytes !== undefined ? { continuation: { offsetBytes: result.nextOffsetBytes } } : {}),
        },
      };
    },
  };
}
