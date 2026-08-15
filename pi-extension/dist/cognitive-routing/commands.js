const PROFILE_VALUES = ["standard", "reasoning", "auto"];
export function cognitiveRoutingProfileCompletions(prefix) {
  const query = prefix ?? "";
  return PROFILE_VALUES.filter((value) => value.startsWith(query)).map((value) => ({
    value,
    label: value,
    description:
      value === "auto" ? "Release the manual hold without changing the model" : `Hold ${value} profile manually`,
  }));
}
export async function handleCognitiveRoutingProfileCommand(args, ctx, controller) {
  const input = (args ?? "").trim().toLowerCase();
  const [action, ...rest] = input.split(/\s+/);
  if (action !== "profile") return false;
  const value = rest.join(" ");
  if (!PROFILE_VALUES.includes(value)) {
    ctx.ui?.notify?.(
      "Usage: /freeflow profile standard, /freeflow profile reasoning, or /freeflow profile auto",
      "warning",
    );
    return true;
  }
  if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
    ctx.ui?.notify?.("Freeflow settings and profile changes are available only while Pi is idle.", "warning");
    return true;
  }
  if (!controller) {
    ctx.ui?.notify?.(
      "Cognitive Routing is unavailable for this session. It may be disabled, unsupported by the Pi host, or suppressed by an explicit startup model selection.",
      "warning",
    );
    return true;
  }
  if (value === "auto") {
    const result = await controller.setAutomaticControl();
    if (result.status === "automatic") {
      ctx.ui?.notify?.("Cognitive Routing manual hold released; automatic control is active.", "info");
    } else {
      ctx.ui?.notify?.(`Cognitive Routing could not release the manual hold: ${result.reason}.`, "warning");
    }
    return true;
  }
  const result = await controller.setManualProfile(value);
  if (result.status === "active") {
    ctx.ui?.notify?.(`Cognitive Routing manual hold set to ${result.profile}.`, "info");
  } else {
    ctx.ui?.notify?.(`Cognitive Routing could not set the manual profile: ${result.reason}.`, "warning");
  }
  return true;
}
