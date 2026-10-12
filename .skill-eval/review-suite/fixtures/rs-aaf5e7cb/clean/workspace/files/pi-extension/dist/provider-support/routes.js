const OPENAI_API = "https://api.openai.com/v1";
/**
 * OpenAI's Sign in with ChatGPT (Pi 0.99): the openai provider's Responses API at api.openai.com with a ChatGPT
 * credential instead of an API key. It reaches the ChatGPT backend, which rejects request fields API keys accept, so
 * Freeflow sends its requests as Pi built them until each adaptation is qualified on it.
 */
export function isChatGPTSignIn(model, ctx) {
  if (model?.provider !== "openai" || model.api !== "openai-responses") return false;
  if ((model.baseUrl ?? OPENAI_API).replace(/\/+$/, "") !== OPENAI_API) return false;
  try {
    return ctx?.modelRegistry?.isUsingOAuth?.(model) === true;
  } catch {
    return false;
  }
}
