export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  return retryWithBackoff(() => fetch(url, init));
}

async function retryWithBackoff(send: () => Promise<Response>, attempts = 4): Promise<Response> {
  let delay = 250;
  for (let attempt = 1; ; attempt++) {
    const response = await send();
    if (response.status < 500 && response.status !== 429) return response;
    if (attempt === attempts) return response;
    // TODO: honor Retry-After on 429 before falling back to the computed delay.
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, 4000);
  }
}
