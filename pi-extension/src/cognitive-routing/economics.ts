import type { Pair, Profile, WorkerProfile } from "./types.js";

const title = (profile: string) => `${profile.charAt(0).toUpperCase()}${profile.slice(1)}`;
const label = (pair: Pair) => `${pair.modelId}/${pair.thinking}`;

/**
 * Advisory checks on a preset. Routing saves money only when a worker is cheaper than Coordinator, and a
 * same-model preset keeps the prompt cache only on routes that survive effort changes.
 */
export function presetWarnings(
  pairs: Partial<Record<Profile, Pair>>,
  workers: readonly WorkerProfile[],
  find: (provider: string, modelId: string) => any,
  keepsCacheAcrossEffort: (model: any) => boolean,
  /** The host's prompt-cache retention tier, when known. */
  retention?: "short" | "long",
): string[] {
  const coordinator = pairs.coordinator;
  const coordinatorModel = coordinator && find(coordinator.provider, coordinator.modelId);
  if (!coordinator || !coordinatorModel) return [];
  const warnings: string[] = [];
  // Freeflow keeps a waiting Coordinator warm during worker runs, but the user's own pauses are the host's
  // retention choice. Advise rather than override it: the longer tier usually costs more per written token.
  const { short, long } = coordinatorModel.promptCache ?? {};
  if (retention === "short" && short > 0 && long > short && coordinatorModel.cost?.cacheWrite > 0)
    warnings.push(
      `Coordinator (${label(coordinator)}) keeps its prompt cache for ${Math.round(short / 60)} minutes on this host, so any pause longer than that writes the whole conversation again. Setting PI_CACHE_RETENTION=long keeps it for ${Math.round(long / 60)} minutes; longer-lived cache writes cost more per token but usually less overall when you pause between messages. Freeflow already keeps it warm while a worker runs.`,
    );
  for (const worker of workers) {
    const pair = pairs[worker];
    const model = pair && find(pair.provider, pair.modelId);
    if (!pair || !model) continue;
    if (pair.provider === coordinator.provider && pair.modelId === coordinator.modelId) {
      if (pair.thinking !== coordinator.thinking && !keepsCacheAcrossEffort(model))
        warnings.push(
          `${title(worker)} and Coordinator both use ${pair.modelId} at different effort (${pair.thinking} vs ${coordinator.thinking}); this route does not keep the prompt cache across effort changes, so every switch between them rereads the whole context.`,
        );
      continue;
    }
    const price = model.cost?.input,
      coordinatorPrice = coordinatorModel.cost?.input;
    if (typeof price === "number" && typeof coordinatorPrice === "number" && price > 0 && price >= coordinatorPrice)
      warnings.push(
        `${title(worker)} (${label(pair)}) costs as much per input token as Coordinator (${label(coordinator)}) or more ($${price} vs $${coordinatorPrice} per million); delegating to it cannot save input cost and adds handoff turns.`,
      );
  }
  return warnings;
}
