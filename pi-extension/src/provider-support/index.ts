import { registerOpenAIEffortSupport } from "./openai/index.js";

export function registerProviderSupport(pi: any): void {
  registerOpenAIEffortSupport(pi);
}
