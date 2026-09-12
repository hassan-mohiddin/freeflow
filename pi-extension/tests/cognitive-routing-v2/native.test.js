import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replay } from "../../dist/cognitive-routing-v2/state.js";
import { fixture, response } from "../fixtures/routing-native.js";

for (const projection of [false, true])
  test(`native delegate/read/return/close with projection=${projection}`, { timeout: 30000 }, async () => {
    let ref;
    const result = await fixture((n, body, manager) => {
      if (n === 1) {
        assert.equal(body.model, "gpt-4o");
        assert.equal(
          body.tools.find((t) => t.name === "freeflow_delegate")?.parameters?.type,
          "object",
          "provider function schema has an object root",
        );
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read evidence.txt and return the exact observed body." },
          },
        ];
      }
      if (n === 2) {
        assert.equal(body.model, "gpt-4.1-mini");
        return [{ name: "read", args: { path: "evidence.txt" } }];
      }
      if (n === 3) {
        assert.equal(body.model, "gpt-4.1-mini");
        const e = manager.getBranch().find((e) => e.message?.role === "toolResult" && e.message.toolName === "read");
        assert.ok(e, "real read result exists");
        ref = `ctx:${e.id}`;
        if (projection) assert.match(JSON.stringify(body), new RegExp(ref));
        return [
          ...(projection ? [{ name: "freeflow_project", args: { operation: "add", refs: [ref] } }] : []),
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Read observed EXACT_EVIDENCE_BODY_81.", outcome: "completed" },
          },
        ];
      }
      if (n === 4) {
        assert.equal(body.model, "gpt-4o");
        assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
        return [
          {
            name: "freeflow_unit",
            args: {
              operation: "close",
              outcome: "accepted",
              assessment: "Actual captured read body supports the fixture assignment.",
            },
          },
        ];
      }
      return [];
    }, projection);
    assert.equal(result.requests.length, 5, JSON.stringify(result.contexts.at(-1), null, 2));
    assert.equal(result.state.unitId, undefined);
    assert.equal([...result.state.units.values()][0].state, "closed");
    const assignments = [...result.state.assignments.values()];
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].state, "returned");
    const read = result.entries.find((e) => e.message?.role === "toolResult" && e.message.toolName === "read");
    assert.match(JSON.stringify(read.message), /EXACT_EVIDENCE_BODY_81/);
  });

test(
  "saved report survives bad selection and payload-free retry; post-return writes are blocked",
  { timeout: 30000 },
  async () => {
    let ref, reportId;
    const report = "SUBSTANTIVE_SAVED_REPORT_902";
    const result = await fixture((n, body, manager) => {
      if (n === 1)
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read evidence and return it; no unrelated writes." },
          },
        ];
      if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
      if (n === 3) {
        ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
        return [
          { name: "freeflow_project", args: { operation: "add", refs: [ref, "ctx:missing"] } },
          {
            name: "freeflow_return",
            args: { operation: "submit", report, outcome: "partial", limitations: ["Bad reference unresolved"] },
          },
        ];
      }
      if (n === 4) {
        assert.equal(body.model, "gpt-4.1-mini");
        const s = replay(manager.getBranch());
        reportId = s.assessment.handoffId;
        assert.equal(s.handoffs.get(reportId).text, report);
        assert.equal(s.handoffs.get(reportId).state, "blocked");
        return [{ name: "write", args: { path: "forbidden.txt", content: "must not happen" } }];
      }
      if (n === 5) {
        const write = manager.getBranch().find((e) => e.message?.toolName === "write");
        assert.ok(write?.message.isError, "post-return task call rejected");
        return [
          {
            name: "freeflow_project",
            args: {
              operation: "remove",
              refs: ["ctx:missing"],
              reason: "Reference was invalid; no missing unique evidence.",
            },
          },
          { name: "freeflow_return", args: { operation: "retry" } },
        ];
      }
      if (n === 6) {
        assert.equal(body.model, "gpt-4o");
        assert.match(JSON.stringify(body), new RegExp(report));
        assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
        const s = replay(manager.getBranch());
        assert.equal(s.assessment.handoffId, reportId);
        assert.equal(s.handoffs.get(reportId).reportRevision, 1);
        return [
          {
            name: "freeflow_unit",
            args: {
              operation: "close",
              outcome: "accepted",
              assessment: "Actual evidence received; saved report preserved.",
            },
          },
        ];
      }
      return [];
    });
    assert.equal(result.requests.length, 7);
    assert.equal(result.state.assignments.size, 1);
  },
);

test("native projection omits an unselected sibling body but preserves its exchange", { timeout: 30000 }, async () => {
  await fixture(
    (n, body, manager) => {
      if (n === 1)
        return [
          {
            name: "freeflow_delegate",
            args: { operation: "assign", contract: "Read both files; select only evidence.txt." },
          },
        ];
      if (n === 2)
        return [
          { name: "read", args: { path: "evidence.txt" } },
          { name: "read", args: { path: "unselected.txt" } },
        ];
      if (n === 3) {
        assert.match(JSON.stringify(body), /UNSELECTED_PRIVATE_BODY_93/);
        const e = manager
          .getBranch()
          .find(
            (e) =>
              e.message?.role === "toolResult" && JSON.stringify(e.message.content).includes("EXACT_EVIDENCE_BODY_81"),
          );
        return [
          { name: "freeflow_project", args: { operation: "add", refs: ["ctx:" + e.id] } },
          {
            name: "freeflow_return",
            args: { operation: "submit", report: "Selected the requested evidence.", outcome: "completed" },
          },
        ];
      }
      if (n > 4) {
        assert.equal(body.model, "gpt-4o");
        assert.match(
          JSON.stringify(body),
          /EXACT_EVIDENCE_BODY_81/,
          "D-002 retains admitted active evidence during attention",
        );
        return [];
      }
      assert.equal(body.model, "gpt-4o");
      assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
      assert.doesNotMatch(JSON.stringify(body), /UNSELECTED_PRIVATE_BODY_93/);
      assert.match(JSON.stringify(body), /Executor result omitted/);
      return [];
    },
    true,
    async ({ session, manager, requests }) => {
      const before = replay(manager.getBranch()).assessment.handoffId;
      await session.reload();
      await session.prompt("A new question unrelated to the pending assessment.");
      await session.waitForIdle();
      const state = replay(manager.getBranch());
      assert.equal(state.assessment.handoffId, before);
      assert.equal(state.assessment.view, "suspended");
      const last = JSON.stringify(requests.at(-1));
      assert.match(last, /EXACT_EVIDENCE_BODY_81/, "suspension pauses historical restoration, not active membership");
      assert.match(last, /suspended/);
    },
  );
});

test("native pre-prompt reload and profile changes preserve unflushed routing state", { timeout: 30000 }, async () => {
  await fixture(
    () => [],
    false,
    async ({ session, manager, notices }) => {
      assert.equal(existsSync(manager.getSessionFile()), true, "first assistant flushes the session file");
      await session.reload();
      await session.prompt("/freeflow profile executor");
      await session.waitForIdle();
      assert.equal(JSON.parse(notices.at(-1)[0]).status, "active");
    },
    true,
    {
      beforePrompt: async ({ session, manager, notices }) => {
        const file = manager.getSessionFile();
        assert.equal(existsSync(file), false, "new session is still unflushed after startup bind");
        await session.reload();
        assert.equal(existsSync(file), false, "reload must not require a pre-flush session file");
        await session.prompt("/freeflow profile executor");
        await session.waitForIdle();
        assert.equal(JSON.parse(notices.at(-1)[0]).status, "active");
        assert.equal(existsSync(file), false, "profile control remains in memory before first assistant");
        await session.reload();
        assert.equal(existsSync(file), false, "profile-triggered reload remains pre-flush");
        await session.prompt("/freeflow profile coordinator");
        await session.waitForIdle();
        assert.equal(JSON.parse(notices.at(-1)[0]).status, "active");
      },
    },
  );
});

test("bundled CLI loads the package entrypoint and completes the real routing loop", { timeout: 30000 }, async () => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const { readFile } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "freeflow-v2-cli-")),
    cwd = join(root, "cwd"),
    agentDir = join(root, "agent");
  try {
    await mkdir(join(cwd, ".freeflow"), { recursive: true });
    await mkdir(agentDir);
    await writeFile(
      join(cwd, ".freeflow/config.json"),
      JSON.stringify({
        cognitiveRouting: {
          enabled: true,
          projection: false,
          profiles: {
            coordinator: { provider: "openai", model: "gpt-4o", thinking: "off" },
            executor: { provider: "openai", model: "gpt-4.1-mini", thinking: "off" },
          },
        },
      }),
    );
    await writeFile(
      join(agentDir, "models.json"),
      JSON.stringify({ providers: { openai: { baseUrl: "https://fixture.invalid/v1" } } }),
    );
    await writeFile(
      join(agentDir, "auth.json"),
      JSON.stringify({ openai: { type: "api_key", key: "fixture-not-real" } }),
    );
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        defaultProvider: "openai",
        defaultModel: "gpt-4o",
        defaultThinkingLevel: "off",
        compaction: { enabled: false },
        retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } },
      }),
    );
    const capture = join(root, "requests.json");
    const extension = join(root, "transport.mjs");
    await writeFile(
      extension,
      `import {writeFileSync} from 'node:fs';\n${response.toString()}\nexport default function(){const models=[];globalThis.fetch=async(url,init)=>{if(!String(url).startsWith('https://fixture.invalid/'))throw new Error('Unexpected network '+url);const body=JSON.parse(String(init.body));models.push(body.model);writeFileSync(${JSON.stringify(capture)},JSON.stringify(models));const n=models.length;if(n>4)throw new Error('Unexpected extra request');const steps=[[{name:'freeflow_delegate',args:{operation:'assign',contract:'Return the observed fixture result.'}}],[{name:'freeflow_return',args:{operation:'submit',report:'Fixture result ready.',outcome:'completed'}}],[{name:'freeflow_unit',args:{operation:'close',outcome:'accepted',assessment:'Received the saved report.'}}],[]];return response(n,steps[n-1]);};}`,
    );
    const cli = fileURLToPath(new URL("./bundle/cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
    const packageEntry = fileURLToPath(new URL("../../freeflow/index.js", import.meta.url));
    const args = [
      cli,
      "-p",
      "--mode",
      "json",
      "--no-extensions",
      "--no-skills",
      "--no-context-files",
      "--no-prompt-templates",
      "--no-themes",
      "-e",
      extension,
      "-e",
      packageEntry,
      "Run the fixture.",
    ];
    const child = spawn(process.execPath, args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        HOME: root,
        PI_CODING_AGENT_DIR: agentDir,
        PI_OFFLINE: "1",
        PI_TELEMETRY: "0",
        PI_SKIP_VERSION_CHECK: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 20000);
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    clearTimeout(timer);
    assert.equal(code, 0, output.slice(-12000));
    assert.deepEqual(JSON.parse(await readFile(capture, "utf8")), ["gpt-4o", "gpt-4.1-mini", "gpt-4o", "gpt-4o"]);
    assert.match(output, /"status":"closed"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const withUI of [false, true])
  test(
    `manual hold and reload preserve outstanding assignment; replacement stays in unit (ui=${withUI})`,
    { timeout: 30000 },
    async () => {
      let originalAssignment, unit;
      await fixture(
        (n, body, manager) => {
          if (n === 1)
            return [
              {
                name: "freeflow_delegate",
                args: { operation: "assign", contract: "Initial assignment; wait for amended direction." },
              },
            ];
          if (n === 2) {
            const s = replay(manager.getBranch());
            originalAssignment = s.assignmentId;
            unit = s.unitId;
            return [];
          }
          if (n === 3) {
            assert.equal(body.model, "gpt-4o");
            return [
              {
                name: "freeflow_delegate",
                args: {
                  operation: "replace",
                  contract: "Return the revised result.",
                  reason: "User explicitly amended the outstanding assignment.",
                },
              },
            ];
          }
          if (n === 4) {
            assert.equal(body.model, "gpt-4.1-mini");
            const s = replay(manager.getBranch());
            assert.equal(s.unitId, unit);
            assert.notEqual(s.assignmentId, originalAssignment);
            assert.equal(s.assignments.get(originalAssignment).state, "superseded");
            return [
              {
                name: "freeflow_return",
                args: { operation: "submit", report: "Revised result.", outcome: "completed" },
              },
            ];
          }
          if (n === 5)
            return [
              {
                name: "freeflow_unit",
                args: { operation: "close", outcome: "accepted", assessment: "Revised result received." },
              },
            ];
          return [];
        },
        false,
        async ({ session, manager, requests, notices }) => {
          await session.prompt("/freeflow profile coordinator");
          assert.equal(replay(manager.getBranch()).control, "manual");
          await session.reload();
          assert.equal(replay(manager.getBranch()).control, "manual");
          assert.equal(replay(manager.getBranch()).assignmentId, originalAssignment);
          await session.prompt("/freeflow profile auto");
          assert.equal(replay(manager.getBranch()).control, "automatic", JSON.stringify(notices));
          await session.prompt("Replace the old assignment with the revised result.");
          await session.waitForIdle();
          assert.equal(requests.length, 6);
          assert.equal(replay(manager.getBranch()).unitId, undefined);
        },
        withUI,
      );
    },
  );

test(
  "native compaction and attention preserve the original assessment and restore exact selected evidence",
  { timeout: 30000 },
  async () => {
    let handoff, ref;
    await fixture(
      (n, body, manager) => {
        if (n === 1)
          return [
            {
              name: "freeflow_delegate",
              args: { operation: "assign", contract: "Read the evidence, select it and return." },
            },
          ];
        if (n === 2) return [{ name: "read", args: { path: "evidence.txt" } }];
        if (n === 3) {
          ref = "ctx:" + manager.getBranch().find((e) => e.message?.toolName === "read").id;
          return [
            { name: "freeflow_project", args: { operation: "add", refs: [ref] } },
            {
              name: "freeflow_return",
              args: { operation: "submit", report: "Review the selected source.", outcome: "completed" },
            },
          ];
        }
        if (n === 4) {
          handoff = replay(manager.getBranch()).assessment.handoffId;
          assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
          return [];
        }
        if (n === 5) {
          assert.doesNotMatch(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
          return [{ name: "freeflow_unit", args: { operation: "assess" } }];
        }
        if (n === 6) {
          assert.match(JSON.stringify(body), /EXACT_EVIDENCE_BODY_81/);
          assert.equal(replay(manager.getBranch()).assessment.handoffId, handoff);
          return [
            {
              name: "freeflow_unit",
              args: {
                operation: "close",
                outcome: "accepted",
                assessment: "Exact selected source recovered after native compaction.",
              },
            },
          ];
        }
        return [];
      },
      true,
      async ({ session, manager, requests }) => {
        await session.compact("Use the deterministic fixture summary.");
        assert.ok(manager.getEntries().some((e) => e.type === "compaction"));
        assert.ok(
          !manager.buildContextEntries().some((e) => "ctx:" + e.id === ref),
          "source is no longer in ordinary active context",
        );
        assert.equal(replay(manager.getBranch()).assessment.handoffId, handoff);
        await session.prompt("Return to the saved assessment.");
        await session.waitForIdle();
        assert.equal(requests.length, 7);
        assert.equal(replay(manager.getBranch()).unitId, undefined);
      },
    );
  },
);
