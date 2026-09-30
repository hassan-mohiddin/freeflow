const OPENAI_API = "https://api.openai.com/v1";

/**
 * OpenAI's Sign in with ChatGPT (Pi 0.99): the openai provider's Responses API at api.openai.com with a ChatGPT
 * credential instead of an API key. It reaches the ChatGPT backend. Live on gpt-6-luna and gpt-6.1-sol (2026-09-30) it
 * rejected prompt_cache_breakpoint, max_output_tokens and configuration_update items with HTTP 400, and reused the
 * whole cached prefix after 25 appended message endings without breakpoints. Freeflow sends its requests as Pi
 * built them.
 */
export function isChatGPTSignIn(model: any, ctx: any): boolean {
  if (model?.provider !== "openai" || model.api !== "openai-responses") return false;
  if ((model.baseUrl ?? OPENAI_API).replace(/\/+$/, "") !== OPENAI_API) return false;
  try {
    return ctx?.modelRegistry?.isUsingOAuth?.(model) === true;
  } catch {
    return false;
  }
}
