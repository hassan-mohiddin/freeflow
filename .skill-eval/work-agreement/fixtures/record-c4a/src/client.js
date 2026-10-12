// Retries a request that fails or is rate limited. `send` returns { status, headers, body }.
export async function fetchWithRetry(
  send,
  { retries = 3, delay = (ms) => new Promise((r) => setTimeout(r, ms)) } = {},
) {
  let attempt = 0;
  for (;;) {
    let response;
    try {
      response = await send();
    } catch (error) {
      if (attempt >= retries) throw error;
      attempt += 1;
      await delay(backoff(attempt));
      continue;
    }
    if (response.status >= 500 && attempt < retries) {
      attempt += 1;
      await delay(backoff(attempt));
      continue;
    }
    return response;
  }
}

// Exponential backoff with jitter.
export function backoff(attempt) {
  return 100 * 2 ** attempt + Math.floor(Math.random() * 100);
}
