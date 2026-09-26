import { registerOpenAIEffortSupport } from "./openai/index.js";
export function registerProviderSupport(pi) {
  registerOpenAIEffortSupport(pi);
}
