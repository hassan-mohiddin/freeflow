import assert from "node:assert/strict";
import test from "node:test";
import { fixture, response } from "../fixtures/routing-native.js";
import { replay } from "../../dist/cognitive-routing-v2/state.js";
import { RoutingRuntime } from "../../dist/cognitive-routing-v2/runtime.js";
import { Sources } from "../../dist/session-sources/sources.js";
import { initialState } from "../../dist/cognitive-routing-v2/state.js";

test("delivery identity uses observed ancestry, not unseen storage or an older retained user", () => {
  const state = initialState();
  const entries = ["old", "delivered", "queued"].map((id, i) => ({
    id,
    parentId: i ? ["old", "delivered"][i - 1] : null,
    type: "message",
    message: { role: "user", content: id, timestamp: i },
  }));
  state.executions.set("observed", { basisUserEntryId: "delivered" });
  const read = (branch, active) =>
    RoutingRuntime.prototype.lastDeliveredUser.call({ stateData: () => state }, new Sources(branch, state), active);
  assert.equal(read(entries, []), "delivered", "unseen queued entry is not delivered");
  assert.equal(read(entries, [entries[0].message]), "delivered", "older retained user does not regress delivery");
  assert.equal(read(entries, [entries[2].message]), "queued", "newly represented user advances delivery");
  assert.equal(read(entries.slice(0, 1), []), null, "a basis outside selected ancestry is not inherited");
  assert.equal(read(entries.slice(0, 1), [entries[0].message]), "old");
});

test("reload and explicit resume after compaction keep the outstanding assignment", { timeout: 30000 }, async () => {
  let assignmentId, basis;
  const result = await fixture(
    (n, body, manager) => {
      if (n === 1)
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read and preserve this assignment through a technical pause." },
          },
        ];
      if (n === 2) {
        const state = replay(manager.getBranch());
        assignmentId = state.assignmentId;
        basis = state.assignments.get(assignmentId).basisUserEntryId;
        return [{ name: "read", args: { path: "evidence.txt" } }];
      }
      if (n === 4) {
        const state = replay(manager.getBranch());
        assert.equal(body.model, "gpt-4.1-mini");
        assert.equal(state.assignmentId, assignmentId);
        assert.equal(state.assignments.size, 1);
        assert.equal(state.resumeBasis.get(assignmentId), basis);
        assert.doesNotMatch(JSON.stringify(body), /New delivered user input requires Coordinator attention/);
        return [{ name: "read", args: { path: "unselected.txt" } }];
      }
      if (n === 5)
        assert.equal(
          manager
            .getBranch()
            .filter((e) => e.message?.toolName === "read")
            .at(-1).message.isError,
          false,
        );
      return [];
    },
    true,
    async ({ session, manager }) => {
      await session.compact();
      assert.equal(
        manager.buildSessionContext().messages.some((m) => m.role === "user"),
        false,
      );
      await session.reload();
      await session.prompt("/freeflow resume");
      await session.waitForIdle();
    },
  );
  assert.equal(result.requests.length, 5);
});

for (const projection of [false, true]) {
  for (const newInput of [false, true]) {
    test(
      `native overflow compaction preserves input identity; projection=${projection}, new input=${newInput}`,
      { timeout: 30000 },
      async () => {
        let session, assignmentId, basis;
        const result = await fixture(
          async (n, body, manager) => {
            const call = (name, args) => [{ name, args }];
            if (n === 1)
              return call("freeflow_delegate", {
                operation: "assign",
                contract: "Read evidence, then continue the same assignment after recovery.",
              });
            if (n === 2) {
              const state = replay(manager.getBranch());
              assignmentId = state.assignmentId;
              basis = state.assignments.get(assignmentId).basisUserEntryId;
              return call("read", { path: "evidence.txt" });
            }
            // The fixture returns one actual provider overflow here. Pi owns the
            // compaction and automatic retry, not a manually invoked routing hook.
            if (n === 3) return [];
            if (n === 4) {
              assert.ok(manager.getEntries().some((e) => e.type === "compaction"));
              assert.equal(
                manager.buildSessionContext().messages.some((m) => m.role === "user"),
                false,
              );
              const state = replay(manager.getBranch());
              assert.equal(state.assignmentId, assignmentId);
              assert.equal(state.assignments.size, 1);
              assert.equal([...state.executions.values()].at(-1).basisUserEntryId, basis);
              assert.doesNotMatch(JSON.stringify(body), /New delivered user input requires Coordinator attention/);
              assert.match(JSON.stringify(body), /Read evidence, then continue the same assignment after recovery/);
              if (newInput) await session.steer("Stop further task reads; report the partial result.");
              return call("read", { path: "unselected.txt" });
            }
            if (n === 5) {
              assert.equal(
                manager
                  .getBranch()
                  .filter((e) => e.message?.toolName === "read")
                  .at(-1).message.isError,
                false,
              );
              if (newInput) {
                assert.match(JSON.stringify(body), /New delivered user input requires Coordinator attention/);
                assert.notEqual([...replay(manager.getBranch()).executions.values()].at(-1).basisUserEntryId, basis);
                return call("read", { path: "evidence.txt" });
              }
              return call("freeflow_return", {
                operation: "submit",
                report: "Same assignment completed after compaction.",
                outcome: "completed",
              });
            }
            if (newInput && n === 6) {
              assert.equal(
                manager
                  .getBranch()
                  .filter((e) => e.message?.toolName === "read")
                  .at(-1).message.isError,
                true,
              );
              return call("freeflow_return", {
                operation: "submit",
                report: "Stopped for genuine new input.",
                outcome: "partial",
              });
            }
            assert.equal(body.model, "gpt-4o");
            assert.equal(replay(manager.getBranch()).assignments.get(assignmentId).state, "returned");
            return [];
          },
          projection,
          async ({ manager }) => {
            assert.equal(manager.getEntries().filter((e) => e.type === "compaction").length, 1);
          },
          true,
          {
            onSession: (s) => {
              session = s;
            },
            settings: { compaction: { enabled: true, keepRecentTokens: 1, reserveTokens: 1 } },
            response: (n, calls) =>
              n === 3
                ? new Response(
                    JSON.stringify({
                      error: {
                        message: "Your input exceeds the context window of this model.",
                        type: "invalid_request_error",
                        code: "context_length_exceeded",
                      },
                    }),
                    { status: 400, headers: { "content-type": "application/json" } },
                  )
                : response(n, calls),
          },
        );
        assert.equal(result.requests.length, newInput ? 7 : 6);
      },
    );
  }
}
