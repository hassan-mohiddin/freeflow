import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createVault, freeflowRetrieve, storeCommandOutput } from "../dist/index.js";

async function withTempVault(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-vault-retrieve-"));
  try {
    return await fn(createVault({ root }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function withFixtureRepo(fn) {
  const root = await mkdtemp(join(tmpdir(), "freeflow-router-repo-"));
  try {
    await writeFile(
      join(root, "router-notes.md"),
      [
        "# Router Notes",
        "",
        "Intro line that should not be enough by itself.",
        "",
        "## Output Router Skill",
        "",
        "The output router skill teaches tool choice without enforcement.",
        "It says freeflow_retrieve is for targeted evidence and freeflow_run is for noisy commands.",
        "Native read and bash remain available for intentional raw output.",
        "",
        ...Array.from({ length: 140 }, (_, index) => `filler line ${index + 1}`),
      ].join("\n"),
      "utf8",
    );

    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("querying vaulted command output returns exact matching failure evidence", async () => {
  await withTempVault(async (vault) => {
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-session",
      command: "npm test",
      stdout: "214 passing",
      stderr: [
        "FAIL first test",
        "first stack line",
        "",
        "FAIL second target test",
        "second stack line",
        "expected true to equal false",
      ].join("\n"),
      executionStatus: "failed",
      exitCode: 1,
      decisionIds: ["ffdec_run"],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const result = await freeflowRetrieve({
      action: "query",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-session",
        outputId: record.outputId,
        stream: "stderr",
      },
      query: "second target",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.equal(result.source?.kind, "vault");
    assert.equal(result.source?.outputId, record.outputId);
    assert.equal(result.evidence?.length, 1);

    const [evidence] = result.evidence;
    assert.equal(evidence.source.kind, "vault");
    assert.equal(evidence.source.outputId, record.outputId);
    assert.match(evidence.excerpt, /FAIL second target test/);
    assert.match(evidence.excerpt, /second stack line/);
    assert.ok(!evidence.excerpt.includes("214 passing"));
    assert.ok(result.recovery?.how.includes("outputId"));
  });
});

test("expanding vaulted output evidence widens the same stream", async () => {
  await withTempVault(async (vault) => {
    const stderr = Array.from({ length: 50 }, (_, index) =>
      index === 24 ? "line 25 target failure marker" : `line ${index + 1}`,
    ).join("\n");
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-expand-session",
      command: "npm test",
      stdout: "",
      stderr,
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-16T00:00:00.000Z",
    });
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-expand-session",
        outputId: record.outputId,
        stream: "stderr",
      },
      query: "target failure marker",
      preserve: "important",
    });
    const [evidence] = queryResult.evidence;

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-expand-session",
        outputId: record.outputId,
        stream: "stderr",
      },
      evidence,
      expansion: "lines_30",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.evidence?.length, 1);
    const [expandedEvidence] = expanded.evidence;
    assert.equal(expandedEvidence.id, evidence.id);
    assert.equal(expandedEvidence.source.kind, "vault");
    assert.equal(expandedEvidence.lines, "1-50");
    assert.equal(expandedEvidence.window, "lines_30");
    assert.match(expandedEvidence.excerpt, /line 1/);
    assert.match(expandedEvidence.excerpt, /line 50/);
  });
});

test("explaining vaulted output returns stored command decision context", async () => {
  await withTempVault(async (vault) => {
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-explain-session",
      command: "npm test",
      stdout: "214 passing",
      stderr: "1 failing",
      executionStatus: "failed",
      exitCode: 1,
      decisionIds: ["ffdec_run_123"],
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const result = await freeflowRetrieve({
      action: "explain",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-explain-session",
        outputId: record.outputId,
      },
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.match(result.routing.reason, new RegExp(record.outputId));
    assert.match(result.routing.reason, /executionStatus=failed/);
    assert.ok(result.recovery?.how.includes("stream"));
    assert.equal(result.recovery?.outputId, record.outputId);
  });
});

test("retrieving vaulted command output returns exact requested lines", async () => {
  await withTempVault(async (vault) => {
    const record = await storeCommandOutput(vault, {
      sessionId: "vault-lines-session",
      command: "npm test",
      stdout: "one\ntwo\nthree",
      stderr: "alpha\nbeta\ngamma",
      combined: "one\ntwo\nthree\nalpha\nbeta\ngamma",
      executionStatus: "failed",
      exitCode: 1,
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    const result = await freeflowRetrieve({
      action: "retrieve",
      source: {
        kind: "vault",
        root: vault.root,
        sessionId: "vault-lines-session",
        outputId: record.outputId,
        stream: "combined",
      },
      lineRange: { start: 2, end: 5 },
      preserve: "full",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.preserve, "full");
    assert.equal(result.evidence?.length, 1);
    const [evidence] = result.evidence;
    assert.equal(evidence.lines, "2-5");
    assert.equal(evidence.window, "exact");
    assert.equal(evidence.excerpt, "two\nthree\nalpha\nbeta");
    assert.equal(evidence.source.kind, "vault");
    assert.equal(evidence.source.outputId, record.outputId);
  });
});

test("querying repo files returns bounded evidence instead of a whole file", async () => {
  await withFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "output router skill tool choice",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.equal(result.routing.route, "retrieve");
    assert.equal(result.preserve, "important");
    assert.ok(result.decisionId.startsWith("ffdec_"));
    assert.ok(result.recovery?.how.includes("expand"));
    assert.equal(result.evidence?.length, 1);

    const [evidence] = result.evidence;
    assert.equal(evidence.source.kind, "repo");
    assert.equal(evidence.path, "router-notes.md");
    assert.match(evidence.excerpt, /output router skill teaches tool choice/);
    assert.ok(!evidence.excerpt.includes("filler line 140"));
    assert.ok(evidence.excerpt.length < 700);
  });
});

test("expanding repo evidence widens the same evidence packet", async () => {
  await withFixtureRepo(async (root) => {
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "output router skill tool choice",
      preserve: "important",
    });
    const [evidence] = queryResult.evidence;

    const expanded = await freeflowRetrieve({
      action: "expand",
      source: { kind: "repo", root },
      evidence,
      expansion: "lines_30",
      preserve: "important",
    });

    assert.equal(expanded.toolStatus, "ok");
    assert.equal(expanded.routing.status, "routed");
    assert.equal(expanded.evidence?.length, 1);
    const [expandedEvidence] = expanded.evidence;
    assert.equal(expandedEvidence.id, evidence.id);
    assert.equal(expandedEvidence.path, evidence.path);
    assert.equal(expandedEvidence.window, "lines_30");
    assert.ok(expandedEvidence.excerpt.length > evidence.excerpt.length);
    assert.match(expandedEvidence.excerpt, /filler line 25/);
    assert.ok(!expandedEvidence.excerpt.includes("filler line 140"));
  });
});

test("preserve full over cap returns exact chunks instead of a summary", async () => {
  await withFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "retrieve",
      source: { kind: "repo", root, path: "router-notes.md" },
      preserve: "full",
      maxFullBytes: 400,
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.preserve, "full");
    assert.equal(result.routing.status, "partial");
    assert.match(result.routing.reason, /exceeds cap/);
    assert.ok(result.recovery?.how.includes("explicit span"));
    assert.equal(result.evidence?.length, 2);

    const [head, tail] = result.evidence;
    assert.equal(head.window, "exact");
    assert.equal(tail.window, "exact");
    assert.match(head.excerpt, /# Router Notes/);
    assert.match(tail.excerpt, /filler line 140/);
    assert.ok(head.excerpt.length + tail.excerpt.length < 900);
  });
});

test("locating repo evidence returns candidate locations without broad evidence", async () => {
  await withFixtureRepo(async (root) => {
    const result = await freeflowRetrieve({
      action: "locate",
      source: { kind: "repo", root },
      query: "output router skill tool choice",
      preserve: "important",
    });

    assert.equal(result.toolStatus, "ok");
    assert.equal(result.routing.status, "routed");
    assert.match(result.routing.reason, /candidate location/);
    assert.equal(result.evidence?.length, 1);

    const [candidate] = result.evidence;
    assert.equal(candidate.path, "router-notes.md");
    assert.equal(candidate.window, "exact");
    assert.match(candidate.lines, /^\d+-\d+$/);
    assert.ok(candidate.excerpt.length < 180);
    assert.ok(!candidate.excerpt.includes("filler line 1"));
    assert.ok(result.recovery?.how.includes("retrieve"));
  });
});

test("explaining a repo retrieval returns the prior route and recovery guidance", async () => {
  await withFixtureRepo(async (root) => {
    const queryResult = await freeflowRetrieve({
      action: "query",
      source: { kind: "repo", root },
      query: "output router skill tool choice",
      preserve: "important",
    });

    const explained = await freeflowRetrieve({
      action: "explain",
      source: { kind: "repo", root },
      decision: queryResult,
    });

    assert.equal(explained.toolStatus, "ok");
    assert.equal(explained.routing.status, "routed");
    assert.match(explained.routing.reason, new RegExp(queryResult.decisionId));
    assert.equal(explained.evidence?.length, 0);
    assert.ok(explained.recovery?.how.includes("expand"));
  });
});
