import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "../fixtures/routing-native.js";

// Recovery grants captured results by their own ids; a context ref is evidence the worker selects. A Coordinator that
// passes a context ref in `results` is told where it goes instead of only that it is unavailable.
test("a context ref given as a captured result is refused with where it belongs", { timeout: 30000 }, async () => {
  let refusal;
  await fixture(
    async (n, body) => {
      if (n === 1)
        return [{ name: "freeflow_delegate", args: { operation: "assign", contract: "Read evidence.txt." } }];
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3)
        return [{ name: "freeflow_return", args: { operation: "submit", report: "Done.", outcome: "completed" } }];
      if (n === 4)
        return [
          {
            name: "freeflow_unit",
            args: { operation: "recover", request: "Select the earlier read.", results: ["ctx:abcdef12"] },
          },
        ];
      if (n === 5) {
        refusal = JSON.stringify(body.input.at(-2) ?? body.input);
        return [];
      }
      return [];
    },
    true,
    async () => {
      assert.match(refusal, /result_unavailable/);
      assert.match(refusal, /ctx:abcdef12 is a context ref, not a captured result id: name it in the request instead/);
    },
    true,
    { freeflowConfig: { toolExecution: { enabled: true } } },
  );
});
