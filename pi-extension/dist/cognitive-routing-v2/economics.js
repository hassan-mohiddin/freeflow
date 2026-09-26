const title = (profile) => `${profile.charAt(0).toUpperCase()}${profile.slice(1)}`;
const label = (pair) => `${pair.modelId}/${pair.thinking}`;
/**
 * Advisory checks on a preset. Routing saves money only when a worker is cheaper than Coordinator, and a
 * same-model preset keeps the prompt cache only on routes that survive effort changes.
 */
export function presetWarnings(pairs, workers, find, keepsCacheAcrossEffort) {
  const coordinator = pairs.coordinator;
  const coordinatorModel = coordinator && find(coordinator.provider, coordinator.modelId);
  if (!coordinator || !coordinatorModel) return [];
  const warnings = [];
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
