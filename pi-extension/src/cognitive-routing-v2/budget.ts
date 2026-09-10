// A local planning estimate, not a provider token count or an output allocation.
// In particular, base64 and native usage/metadata are not model text.
export function estimateRequest(systemPrompt: string, tools: readonly any[], messages: readonly any[], model: any) {
  const text = (value: string) => Math.ceil(value.length / 3);
  const content = (value: any): number =>
    typeof value === "string"
      ? text(value)
      : Array.isArray(value)
        ? value.reduce(
            (sum, b) =>
              sum +
              (b.type === "image"
                ? 1200
                : b.type === "toolCall"
                  ? text(b.name + JSON.stringify(b.arguments ?? {}))
                  : b.type === "thinking"
                    ? text(b.thinking ?? "")
                    : text(b.text ?? "")),
            0,
          )
        : 0;
  const estimatedTokens =
    text(systemPrompt) +
    text(JSON.stringify(tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })))) +
    messages.reduce((sum, m) => sum + 8 + content(m.content), 0);
  const window = model?.contextWindow ?? 0;
  const outputReserve = Math.min(4096, Math.max(1, Math.floor(window / 10)));
  const maximumInputTokens = Math.max(0, window - outputReserve);
  const estimateMethod =
    "Planning estimate: text characters / 3, 1200 tokens/image, schemas and message framing; output headroom is not the provider allocation";
  const warnings =
    estimatedTokens > maximumInputTokens
      ? [
          {
            ref: "",
            code: "budget_estimate",
            detail: `Estimated input ${estimatedTokens} exceeds planning allowance ${maximumInputTokens}. Actual output allocation and image tokenization are provider-dependent; fit is unconfirmed. Use native compaction or revise explicitly if the provider rejects the request.`,
          },
        ]
      : [];
  return { estimatedTokens, maximumInputTokens, outputReserve, estimateMethod, warnings };
}
