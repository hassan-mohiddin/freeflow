import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithRetry } from "../src/client.js";

const noDelay = async () => {};
const sequence = (...responses) => {
  let index = 0;
  return async () => {
    const next = responses[Math.min(index++, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
};

test("returns the first successful response", async () => {
  const response = await fetchWithRetry(sequence({ status: 200, body: "ok" }), { delay: noDelay });
  assert.equal(response.body, "ok");
});

test("retries a 503 and then succeeds", async () => {
  const response = await fetchWithRetry(sequence({ status: 503 }, { status: 200, body: "ok" }), { delay: noDelay });
  assert.equal(response.status, 200);
});

test("retries a network error and then succeeds", async () => {
  const response = await fetchWithRetry(sequence(new Error("ECONNRESET"), { status: 200 }), { delay: noDelay });
  assert.equal(response.status, 200);
});

test("retries a 429 and then succeeds", async () => {
  const response = await fetchWithRetry(sequence({ status: 429 }, { status: 200, body: "ok" }), { delay: noDelay });
  assert.equal(response.status, 200);
});

test("gives up after the configured retries", async () => {
  let calls = 0;
  const send = async () => {
    calls += 1;
    return { status: 503 };
  };
  const response = await fetchWithRetry(send, { retries: 2, delay: noDelay });
  assert.equal(response.status, 503);
  assert.equal(calls, 3);
});
