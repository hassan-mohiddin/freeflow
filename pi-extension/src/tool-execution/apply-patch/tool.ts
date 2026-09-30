import { APPLY_PATCH_LARK_GRAMMAR } from "./grammar.js";
import { applyPatch, type PatchFileState, type PatchResult } from "./plan.js";

export const APPLY_PATCH = "apply_patch";

const DESCRIPTION =
  "Use the apply_patch tool to edit files. Its input is a patch: *** Begin Patch, then *** Add File:, *** Update File: (optionally followed by *** Move to:) or *** Delete File: sections, then *** End Patch. In update sections, @@ lines anchor a hunk and every other line starts with space (context), - (remove) or + (add). Include enough context lines for each hunk to match one place.";

const CODES = { add: "A", update: "M", move: "M", delete: "D" } as const;

/** Codex's summary on success, so GPT models read the result they were trained on. */
export function resultText(result: PatchResult): string {
  const notes = result.notes;
  if (result.status === "applied")
    return [
      "Success. Updated the following files:",
      ...result.files.map((file) => `${CODES[file.operation]} ${file.to ?? file.path}`),
      ...notes,
    ].join("\n");
  if (result.status === "not_applied")
    return [`Patch not applied; no files changed. ${result.error ?? ""}`.trim(), ...notes].join("\n");
  const named = (outcome: string) =>
    result.files.filter((file) => file.outcome === outcome).map((file) => file.to ?? file.path);
  const failed = result.files.find((file) => file.outcome === "failed");
  return [
    `Patch partly applied. Written: ${named("written").join(", ") || "none"}. Not written: ${named("not_written").join(", ") || "none"}. Failed: ${failed?.to ?? failed?.path}: ${failed?.error}.`,
    "Read the files named above before changing them again.",
    ...notes,
  ].join("\n");
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["applied", "not_applied", "partial"] },
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          operation: { type: "string", enum: ["add", "update", "delete", "move"] },
          to: { type: "string" },
          outcome: { type: "string", enum: ["written", "not_written", "failed"] },
          error: { type: "string" },
        },
        required: ["path", "operation", "outcome"],
      },
    },
  },
  required: ["status", "files"],
};

export interface ApplyPatchHost {
  /** Whether Tool Execution is effective now. */
  effective(): boolean;
  /** File tracking for this context, rebuilt from the branch when needed. */
  files(ctx: any): Promise<PatchFileState>;
  /** Record what the patch wrote, as a successful write does. */
  written(paths: readonly string[], ctx: any): Promise<void>;
}

/** Registered once, inactive until Tool Execution is effective (see tool-execution/tools.ts). */
export function registerApplyPatch(pi: any, host: ApplyPatchHost): void {
  pi.registerTool({
    name: APPLY_PATCH,
    label: APPLY_PATCH,
    description: DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        input: { type: "string", description: "The patch, from *** Begin Patch to *** End Patch." },
      },
      required: ["input"],
    },
    // GPT-5+ models on OpenAI endpoints receive Codex's freeform grammar tool; other models a one-string function.
    constrainedSampling: { type: "grammar", variants: { openai_lark: APPLY_PATCH_LARK_GRAMMAR } },
    outputSchema: OUTPUT_SCHEMA,
    exposure: "direct",
    defaultActive: false,
    executionMode: "sequential",
    async execute(_id: string, params: { input: string }, _signal: AbortSignal, _update: unknown, ctx: any) {
      if (!host.effective()) throw new Error("apply_patch is available only while Freeflow Tool Execution is on.");
      const result = await applyPatch(String(params?.input ?? ""), ctx.cwd, await host.files(ctx));
      const written = result.files.filter((file) => file.outcome === "written");
      await host.written(
        written.flatMap((file) => [file.path, ...(file.to ? [file.to] : [])]),
        ctx,
      );
      return {
        content: [{ type: "text", text: resultText(result) }],
        details: result,
        structuredContent: { status: result.status, files: result.files },
        ...(result.status === "applied" ? {} : { isError: true }),
      };
    },
  });
}
