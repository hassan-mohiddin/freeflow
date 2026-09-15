import { registerAstraSupport } from "./astra/index.js";

export function registerProviderSupport(pi: any): void {
  registerAstraSupport(pi);
}
