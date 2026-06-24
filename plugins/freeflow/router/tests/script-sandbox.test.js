import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SCRIPT_DERIVE_CONFIG,
  discoverQuickJsWasiSandboxAdaptersFromEnv,
  SCRIPT_DERIVE_LANGUAGES,
  SCRIPT_SANDBOX_PROOF_FIXTURES,
  SCRIPT_SANDBOX_REQUIRED_PROOFS,
  probeScriptSandboxAdapters,
  scriptSandboxProofFixturesForLanguage,
  selectScriptSandboxAdapter,
} from "../dist/index.js";

function config(overrides = {}) {
  return {
    ...DEFAULT_SCRIPT_DERIVE_CONFIG,
    ...overrides,
    languages: overrides.languages ?? [...DEFAULT_SCRIPT_DERIVE_CONFIG.languages],
    limits: { ...DEFAULT_SCRIPT_DERIVE_CONFIG.limits, ...(overrides.limits ?? {}) },
  };
}

function fakeAdapter({ id = "fake-sandbox", languages = ["javascript"], probe }) {
  return {
    id,
    version: "test",
    languages,
    async probe(language, sandboxConfig) {
      return probe(language, sandboxConfig);
    },
    async execute() {
      throw new Error("fake adapter execute should not be called by Slice 16 probes");
    },
  };
}

test("script sandbox proof fixtures cover every required proof for every target language", () => {
  assert.deepEqual(
    SCRIPT_SANDBOX_PROOF_FIXTURES.map((fixture) => fixture.proof).sort(),
    [...SCRIPT_SANDBOX_REQUIRED_PROOFS].sort(),
  );

  for (const language of SCRIPT_DERIVE_LANGUAGES) {
    const fixtures = scriptSandboxProofFixturesForLanguage(language);
    assert.deepEqual(
      fixtures.map((fixture) => fixture.proof).sort(),
      [...SCRIPT_SANDBOX_REQUIRED_PROOFS].sort(),
    );
    for (const fixture of fixtures) {
      assert.equal(typeof fixture.program, "string");
      assert.ok(fixture.program.length > 0, `${language} fixture ${fixture.proof} should include an adversarial program`);
      assert.ok(fixture.adapterAssertion.length > 0, `${fixture.proof} should describe the adapter-level assertion`);
      assert.ok(fixture.expected.length > 0, `${fixture.proof} should describe expected behavior`);
    }
  }
});

test("script sandbox probe reports all configured languages unavailable when no adapter is registered", async () => {
  const report = await probeScriptSandboxAdapters({ config: config({ enabled: true, languages: ["javascript", "python", "jq"] }) });

  assert.equal(report.contractVersion, 1);
  assert.equal(report.adapterAvailable, false);
  assert.equal(report.adapterStatus, "unavailable");
  assert.deepEqual(report.availableLanguages, []);
  assert.deepEqual(report.configuredLanguages, ["javascript", "python", "jq"]);
  assert.deepEqual(report.registeredAdapters, []);
  assert.deepEqual(report.requiredProofs, [...SCRIPT_SANDBOX_REQUIRED_PROOFS]);
  assert.equal(report.unavailableLanguages.length, 3);
  assert.ok(report.unavailableLanguages.every((entry) => entry.status === "unavailable"));
  assert.ok(report.unavailableLanguages.every((entry) => entry.reason.includes("No script derive sandbox adapter is registered")));
  assert.ok(report.unavailableLanguages.every((entry) => entry.failedProofs.length === SCRIPT_SANDBOX_REQUIRED_PROOFS.length));
  assert.ok(report.candidateMechanisms.some((candidate) => candidate.id === "node-vm" && candidate.status === "rejected"));
  assert.ok(report.candidateMechanisms.some((candidate) => candidate.id === "os-sandbox-adapter" && candidate.status === "candidate_unproven"));
});

test("script sandbox probe requires every adversarial proof before a language becomes available", async () => {
  const partialAdapter = fakeAdapter({
    probe() {
      return {
        status: "available",
        reason: "partial proof should not be enough",
        passedProofs: ["env_access_denied", "network_access_denied"],
        failedProofs: [],
        runtime: { name: "fake-js", version: "0" },
      };
    },
  });

  const report = await probeScriptSandboxAdapters({ config: config({ enabled: true, languages: ["javascript"] }), adapters: [partialAdapter] });
  assert.equal(report.adapterAvailable, false);
  assert.equal(report.unavailableLanguages[0].adapterId, "fake-sandbox");
  assert.deepEqual(report.unavailableLanguages[0].passedProofs, ["env_access_denied", "network_access_denied"]);
  assert.ok(report.unavailableLanguages[0].failedProofs.includes("home_access_denied"));

  const selected = await selectScriptSandboxAdapter("javascript", config({ enabled: true, languages: ["javascript"] }), [partialAdapter]);
  assert.equal(selected.ok, false);
  assert.equal(selected.status.status, "unavailable");
});

test("script sandbox probe keeps trying adapters until one passes every proof", async () => {
  const probed = [];
  const partialAdapter = fakeAdapter({
    id: "partial-sandbox",
    probe() {
      probed.push("partial-sandbox");
      return {
        status: "available",
        reason: "partial proof should not stop later adapters",
        passedProofs: ["env_access_denied"],
        failedProofs: [],
      };
    },
  });
  const provenAdapter = fakeAdapter({
    id: "proven-after-partial",
    probe() {
      probed.push("proven-after-partial");
      return {
        status: "available",
        reason: "later adapter passed fake proof suite",
        passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        failedProofs: [],
        runtime: { name: "fake-js", version: "2" },
      };
    },
  });

  const report = await probeScriptSandboxAdapters({
    config: config({ enabled: true, languages: ["javascript"] }),
    adapters: [partialAdapter, provenAdapter],
  });

  assert.deepEqual(probed, ["partial-sandbox", "proven-after-partial"]);
  assert.equal(report.adapterAvailable, true);
  assert.deepEqual(report.availableLanguages, ["javascript"]);
  assert.equal(report.languages[0].adapterId, "proven-after-partial");
  assert.equal(report.languages[0].runtime.name, "fake-js");

  const selected = await selectScriptSandboxAdapter("javascript", config({ enabled: true, languages: ["javascript"] }), [partialAdapter, provenAdapter]);
  assert.equal(selected.ok, true);
  assert.equal(selected.adapter.id, "proven-after-partial");
});

test("script sandbox probe can select a registered adapter only after all proofs pass", async () => {
  const provenAdapter = fakeAdapter({
    id: "proven-test-sandbox",
    languages: ["javascript", "jq"],
    probe(language) {
      return {
        status: "available",
        reason: `${language} passed fake proof suite`,
        passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        failedProofs: [],
        runtime: { name: `fake-${language}`, version: "1" },
      };
    },
  });

  const report = await probeScriptSandboxAdapters({ config: config({ enabled: false, languages: ["javascript", "jq"] }), adapters: [provenAdapter] });
  assert.equal(report.adapterAvailable, true);
  assert.deepEqual(report.availableLanguages, ["javascript", "jq"]);
  assert.deepEqual(report.unavailableLanguages, []);
  assert.equal(report.languages[0].adapterId, "proven-test-sandbox");
  assert.equal(report.languages[0].runtime.name, "fake-javascript");

  const selected = await selectScriptSandboxAdapter("jq", config({ enabled: false, languages: ["javascript", "jq"] }), [provenAdapter]);
  assert.equal(selected.ok, true);
  assert.equal(selected.adapter.id, "proven-test-sandbox");
  assert.equal(selected.status.status, "available");
});

test("QuickJS discovery reports unavailable for invalid explicit package roots", async () => {
  const adapters = await discoverQuickJsWasiSandboxAdaptersFromEnv({ FREEFLOW_QUICKJS_WASI_ROOT: "/tmp/freeflow-missing-quickjs-wasi-root" });
  assert.equal(adapters.length, 1);

  const report = await probeScriptSandboxAdapters({ config: config({ enabled: true, languages: ["javascript"] }), adapters });
  assert.equal(report.adapterAvailable, false);
  assert.equal(report.unavailableLanguages[0].adapterId, "quickjs-wasi");
  assert.match(report.unavailableLanguages[0].reason, /could not load/);
});

test("script sandbox selection respects scriptDerive.languages before probing adapters", async () => {
  let probed = false;
  const adapter = fakeAdapter({
    languages: ["python"],
    probe() {
      probed = true;
      return {
        status: "available",
        reason: "should not be probed",
        passedProofs: [...SCRIPT_SANDBOX_REQUIRED_PROOFS],
        failedProofs: [],
      };
    },
  });

  const selected = await selectScriptSandboxAdapter("python", config({ enabled: true, languages: ["javascript"] }), [adapter]);
  assert.equal(selected.ok, false);
  assert.equal(probed, false);
  assert.match(selected.status.reason, /not enabled by scriptDerive\.languages/);
});
