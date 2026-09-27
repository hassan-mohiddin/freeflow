import assert from "node:assert/strict";
import test from "node:test";
import { SessionState } from "../../dist/provider-support/openai/session-state.js";
import { assemble, ENTRY_TYPE } from "../../dist/provider-support/openai/history.js";

function fixture() {
  const branch = [];
  const append = (type, fields = {}) => {
    const entry = { id: `entry-${branch.length}`, parentId: branch.at(-1)?.id ?? null, type, ...fields };
    branch.push(entry);
    return entry.id;
  };
  const reader = {
    getBranch: () => branch,
    getLeafId: () => branch.at(-1)?.id ?? null,
    getSessionFile: () => undefined,
  };
  const store = new SessionState({ appendEntry: (customType, data) => append("custom", { customType, data }) }, reader);
  return { branch, append, reader, store };
}
const payload = (effort = "high") => ({
  model: "gpt-6-astra",
  instructions: "same",
  tools: [],
  reasoning: { effort },
  input: [{ role: "user", content: "same" }],
});

test("a branch summary keeps pre-branch effort history for the unchanged prefix", async () => {
  const f = fixture();
  const old = assemble(payload(), "openai/gpt-6-astra", f.store.generation(), f.reader.getLeafId(), []);
  f.store.append(old.record);
  f.append("branch_summary");
  // The path before the branch point is unchanged, so the generation is too.
  assert.equal(f.store.generation(), old.record.generation);
  const current = assemble(
    payload("low"),
    "openai/gpt-6-astra",
    f.store.generation(),
    f.reader.getLeafId(),
    await f.store.records(),
  );
  assert.equal(current.baseline, "high");
  assert.equal(current.record.parent, old.record.id);
});

test("records written under the earlier branch-summary boundary remain readable", async () => {
  const f = fixture();
  const summary = f.append("branch_summary");
  // Before compaction-only boundaries, a record after a branch summary carried the summary's id.
  const legacy = assemble(payload(), "openai/gpt-6-astra", summary, f.reader.getLeafId(), []);
  f.store.append(legacy.record);
  assert.equal((await f.store.records()).length, 1);
});

for (const boundary of ["compaction"]) {
  test(`${boundary} excludes pre-boundary history even with identical input`, async () => {
    const f = fixture();
    const old = assemble(payload(), "openai/gpt-6-astra", f.store.generation(), f.reader.getLeafId(), []);
    f.store.append(old.record);
    const epoch = f.append(boundary);
    f.append("model_change", { provider: "openai", modelId: "gpt-6-luna" });
    f.append("model_change", { provider: "openai", modelId: "gpt-6-astra" });
    assert.equal(f.store.generation(), epoch);
    const current = assemble(
      payload("low"),
      "openai/gpt-6-astra",
      epoch,
      f.reader.getLeafId(),
      await f.store.records(),
    );
    assert.equal(current.baseline, "low");
    assert.equal(current.record.parent, null);
    // A persisted cross-boundary parent must not become valid through normalization.
    f.store.append({ ...current.record, parent: old.record.id, baseline: "high", effective: "high" });
    await assert.rejects(f.store.records(), /Invalid OpenAI effort history parent/);
  });
}

test("unknown generation and invalid native ancestry are rejected, not normalized into eligibility", async () => {
  const f = fixture();
  const old = assemble(payload(), "openai/gpt-6-astra", "unrelated-model-entry", null, []);
  f.store.append(old.record);
  await assert.rejects(f.store.records(), /generation unavailable/);
  f.branch[0].parentId = "missing";
  await assert.rejects(f.store.records(), /Invalid OpenAI effort session ancestry/);
});

test("changed envelope or earlier projected content cannot replay an old effort update", async () => {
  const high = payload();
  const first = assemble(high, "openai/gpt-6-astra", "root", null, []);
  const low = { ...payload("low"), input: [...high.input, { role: "user", content: "later" }] };
  const second = assemble(low, "openai/gpt-6-astra", "root", null, [first.record]);
  for (const changed of [
    { ...low, instructions: "different" },
    { ...low, input: [{ role: "user", content: "structural omission" }] },
  ]) {
    const result = assemble(changed, "openai/gpt-6-astra", "root", null, [first.record, second.record]);
    assert.equal(result.record.parent, null);
    assert.deepEqual(
      result.payload.input.filter((x) => x.type !== "configuration_update"),
      changed.input,
    );
  }
  const differentModel = assemble(low, "other-model", "root", null, [first.record, second.record]);
  assert.equal(differentModel.record.parent, null);
  assert.equal(differentModel.baseline, "low");
});
