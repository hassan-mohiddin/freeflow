import { registerOpenAIEffortSupport } from "./openai/index.js";

export function registerProviderSupport(pi: any, enabled?: () => boolean): void {
  registerOpenAIEffortSupport(pi, enabled);
}
